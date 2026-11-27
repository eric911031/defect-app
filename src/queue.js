// 離線佇列：createDefect / submitFix 一律先寫進 IndexedDB 再送，
// 恢復網路、App 回到前景、開啟 App 或每 60 秒時自動補送。
// 後端以缺失ID 去重，重送不會產生重複資料。
import { queueStore } from './db.js';
import { call, ApiError } from './api.js';
import { setState, getState } from './store.js';
import { upsertItems, autoUpdate } from './offline.js';

const listeners = new Set();
export function onSent(fn) { listeners.add(fn); return () => listeners.delete(fn); }

const DAY = 86400e3;
export async function refreshCount() {
  const items = await queueStore.all();
  const now = Date.now();
  setState({
    pending: items.length,
    pendingFailed: items.filter(i => i.error && !i.retryable).length,
    pendingOld: items.filter(i => now - i.createdAt > DAY).length // 超過 24 小時還沒送出
  });
  return items;
}

export async function enqueue(action, data, summary) {
  const item = { id: `${action}:${data.缺失ID}`, action, data, summary, createdAt: Date.now(), tries: 0, error: null, retryable: true };
  await queueStore.put(item);
  await refreshCount();
  return item;
}

let flushing = null;
export function flush({ includeFailed = false } = {}) {
  if (flushing) return flushing;
  flushing = (async () => {
    setState({ syncing: true });
    let sent = 0, stopped = false;
    try {
      const items = await queueStore.all();
      for (const item of items) {
        if (item.error && !item.retryable && !includeFailed) continue;
        try {
          const result = await call(item.action, item.data);
          // 先更新離線資料再刪佇列，清單不會出現「兩筆都沒有」的空檔
          if (result?.缺失ID && result.工地ID) await upsertItems(result.工地ID, [result]).catch(() => {});
          await queueStore.del(item.id);
          sent++;
          listeners.forEach(f => f(item, result));
        } catch (e) {
          item.tries++;
          if (e instanceof ApiError && (e.network || e.code === 'BUSY' || e.code === 'UNAUTHENTICATED')) {
            item.error = e.message; item.retryable = true;
            await queueStore.put(item);
            if (e.code === 'UNAUTHENTICATED') setState({ needLogin: true });
            stopped = true;
            break; // 網路或登入問題：停下來等下次
          }
          // 資料本身的錯誤（超出範圍、權限、狀態不符）：標記失敗，讓使用者決定
          item.error = `${e.code || ''} ${e.message}`.trim(); item.retryable = false;
          await queueStore.put(item);
        }
      }
    } finally {
      await refreshCount();
      setState({ syncing: false, online: navigator.onLine });
      flushing = null;
    }
    return { sent, stopped };
  })();
  return flushing;
}

export async function removeItem(id) { await queueStore.del(id); await refreshCount(); }
export async function listItems() { return queueStore.all(); }

export function startAutoSync() {
  const kick = () => { if (getState().user && !getState().needLogin) flush(); };
  window.addEventListener('online', () => { setState({ online: true }); kick(); autoUpdate(); });
  window.addEventListener('offline', () => setState({ online: false }));
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') { kick(); refreshCount(); autoUpdate(); } });
  setInterval(kick, 60000);
  refreshCount().then(kick);
}
