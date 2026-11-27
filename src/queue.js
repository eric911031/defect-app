// 離線佇列：createDefect / submitFix / review / updateDefect 一律先寫進 IndexedDB 再送，
// 恢復網路、App 回到前景、開啟 App 或每 60 秒時自動補送。
// 後端以缺失ID 去重，重送不會產生重複資料。
// review、updateDefect 帶「更新時間」（看到資料時的版本）；別人改過時後端回 CONFLICT，
// 這筆停在佇列，由使用者在「待上傳」頁選「用我的覆蓋」或「放棄我的」（O5）。
import { queueStore } from './db.js';
import { call, ApiError } from './api.js';
import { setState, getState } from './store.js';
import { upsertItems, autoUpdate } from './offline.js';

const listeners = new Set();
export function onSent(fn) { listeners.add(fn); return () => listeners.delete(fn); }

// 自己的待上傳（舊版沒有 email 的也算自己的）
export const isMine = (item, email) => !item.email || !email || item.email === email;

const DAY = 86400e3;
export async function refreshCount() {
  const items = await queueStore.all();
  const now = Date.now();
  setState({
    pending: items.length,
    pendingFailed: items.filter(i => i.error && !i.retryable).length,
    pendingConflict: items.filter(i => i.conflict).length,
    pendingOld: items.filter(i => now - i.createdAt > DAY).length // 超過 24 小時還沒送出
  });
  return items;
}

export async function enqueue(action, data, summary) {
  const id = `${action}:${data.缺失ID}`;
  const old = await queueStore.get(id).catch(() => null);
  let item = { id, action, data, summary, createdAt: Date.now(), tries: 0, error: null, retryable: true, email: getState().user?.Email || '' };
  if (old && action === 'updateDefect') {
    // 同一筆離線編輯兩次：合併欄位，保留第一次看到的版本（更新時間）與排隊順序
    const d = { ...old.data, 欄位: { ...old.data.欄位, ...data.欄位 } };
    item = { ...item, data: d, createdAt: old.createdAt };
  }
  await queueStore.put(item);
  await refreshCount();
  return item;
}

let flushing = null;
export function flush({ includeFailed = false } = {}) {
  if (flushing) return flushing;
  flushing = (async () => {
    setState({ syncing: true });
    let sent = 0, stopped = false, conflicts = 0;
    const results = new Map();
    const fresh = new Map(); // 本次已送出的缺失ID → 新的更新時間（同一筆後面的動作接著用）
    const email = getState().user?.Email;
    try {
      const items = await queueStore.all();
      for (const item of items) {
        if (!isMine(item, email)) continue; // 別的帳號留下的：要用該帳號登入才能上傳
        if (item.conflict) continue;         // 等使用者處理衝突
        if (item.error && !item.retryable && !includeFailed) continue;
        const data = { ...item.data };
        if ('更新時間' in data && fresh.has(data.缺失ID)) data.更新時間 = fresh.get(data.缺失ID);
        try {
          const result = await call(item.action, data);
          // 先更新離線資料再刪佇列，清單不會出現「兩筆都沒有」的空檔
          if (result?.缺失ID && result.工地ID) await upsertItems(result.工地ID, [result]).catch(() => {});
          if (result?.缺失ID && result.更新時間 != null) fresh.set(result.缺失ID, result.更新時間);
          await queueStore.del(item.id);
          sent++;
          results.set(item.id, result);
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
          if (e instanceof ApiError && e.code === 'CONFLICT') {
            item.conflict = { current: e.目前資料 || null, at: Date.now() };
            item.error = e.message || '這筆資料已被別人修改'; item.retryable = false;
            await queueStore.put(item);
            if (e.目前資料?.缺失ID && e.目前資料.工地ID) await upsertItems(e.目前資料.工地ID, [e.目前資料]).catch(() => {});
            conflicts++;
            continue;
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
    return { sent, stopped, conflicts, results };
  })();
  return flushing;
}

// 送出一筆並回傳結果：{ result } 已送出；{ conflict } 衝突；{ queued } 留在手機（離線等）；{ error } 失敗
export async function enqueueAndSend(action, data, summary) {
  const item = await enqueue(action, data, summary);
  let r = await flush();
  if (!r.results.has(item.id) && !r.stopped) {
    // 已有一輪在送（沒包含這筆）：再送一次
    const left = await queueStore.get(item.id).catch(() => null);
    if (left && !left.conflict && left.retryable) r = await flush();
  }
  if (r.results.has(item.id)) return { result: r.results.get(item.id) };
  const left = await queueStore.get(item.id).catch(() => null);
  if (!left) return { result: null };
  if (left.conflict) return { conflict: left };
  if (!left.retryable) return { error: left.error, item: left };
  return { queued: left };
}

// ---- 衝突處理（O5）----
// 可不可以「用我的覆蓋」：要拿得到目前資料，而且動作在目前狀態下還有意義
export function canOverwrite(item) {
  const cur = item.conflict?.current;
  if (!cur) return false;
  if (item.action === 'submitFix') return false;               // 已結案（或別人已回報）的改善只能放棄
  if (item.action === 'review') return cur.狀態 === '待確認';  // 已被確認或退回：不能再確認
  return true;
}
export async function resolveConflict(id, choice) {
  const item = await queueStore.get(id);
  if (!item) return;
  const cur = item.conflict?.current;
  if (choice === 'mine' && canOverwrite(item)) {
    item.data = { ...item.data, 更新時間: cur.更新時間 ?? '' }; // 用目前版本重送
    item.conflict = null; item.error = null; item.retryable = true; item.tries = 0;
    await queueStore.put(item);
    await refreshCount();
    return flush();
  }
  await queueStore.del(id);
  if (cur?.缺失ID && cur.工地ID) await upsertItems(cur.工地ID, [cur]).catch(() => {});
  await refreshCount();
}

export async function removeItem(id) { await queueStore.del(id); await refreshCount(); }
export async function listItems() { return queueStore.all(); }

export function startAutoSync() {
  const kick = () => { if (getState().user && !getState().needLogin) return flush(); };
  // 先補送再更新離線資料，避免剛送出的那筆被誤判為「本機沒有」而改成全量
  const kickAndUpdate = () => Promise.resolve(kick()).finally(() => autoUpdate());
  window.addEventListener('online', () => { setState({ online: true }); kickAndUpdate(); });
  window.addEventListener('offline', () => setState({ online: false }));
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') { refreshCount(); kickAndUpdate(); } });
  setInterval(kick, 60000);
  refreshCount().then(kick);
}
