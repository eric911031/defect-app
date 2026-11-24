// 讀取資料（含離線快取）
import { call } from './api.js';
import { kv } from './db.js';
import { setState, getState } from './store.js';

export async function loadMe() {
  try {
    const me = await call('me');
    await kv.set('me', me);
    return me;
  } catch (e) {
    if (e.network) { const cached = await kv.get('me'); if (cached) return cached; }
    throw e;
  }
}

export async function loadCodes() {
  try {
    const codes = await call('codes');
    await kv.set('codes', codes);
    setState({ codes });
  } catch (e) {
    const cached = await kv.get('codes');
    if (cached) setState({ codes: cached });
  }
}

// 讀取某工地的缺失（自動翻頁）。回傳 {items, fromCache}
export const defectsKey = (siteId, status) => `defects:${siteId}:${status || 'all'}`;
export async function cachedDefects(siteId, status) { try { return await kv.get(defectsKey(siteId, status)); } catch { return null; } }

export async function loadDefects(siteId, status) {
  const key = defectsKey(siteId, status);
  try {
    const per = 1000; let page = 1, items = [];
    for (;;) {
      const r = await call('listDefects', { 工地ID: siteId, 狀態: status || undefined, 頁: page, 每頁: per });
      const batch = Array.isArray(r) ? r : r.items || [];
      items = items.concat(batch);
      const total = Array.isArray(r) ? batch.length : (r.total ?? batch.length);
      if (batch.length < per || items.length >= total) break;
      page++;
    }
    kv.set(key, { items, at: Date.now() }).catch(() => {});
    return { items, fromCache: false };
  } catch (e) {
    if (e.network) { const c = await kv.get(key); if (c) return { items: c.items, fromCache: true, at: c.at }; }
    throw e;
  }
}

export function codeText(code) {
  if (!code) return '';
  const c = getState().codes.find(c => c.代碼 === code);
  return c ? c.內容 : '';
}

export async function cachedDefect(id) {
  const site = getState().site;
  if (!site) return null;
  for (const st of ['未改善', 'all', '待確認', '已結案']) {
    const c = await kv.get(`defects:${site.工地ID}:${st}`);
    const d = c?.items?.find(x => x.缺失ID === id);
    if (d) return d;
  }
  return null;
}

// 先回快取（若有）再背景更新：onData 可能被呼叫兩次
export async function swr(key, fetcher, onData) {
  let cached = null;
  try { cached = await kv.get(key); } catch {}
  if (cached) onData(cached.v, true);
  try {
    const v = await fetcher();
    kv.set(key, { v, at: Date.now() }).catch(() => {});
    onData(v, false);
  } catch (e) {
    if (!cached) throw e;
  }
}
