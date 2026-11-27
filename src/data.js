// 讀取資料（含離線快取）
import { call } from './api.js';
import { kv } from './db.js';
import { setState, getState } from './store.js';
import { getSiteData, overlay, upsertItems, pendingOverlay, pendingDefect, applyFix } from './offline.js';

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

// 讀取某工地的缺失（自動翻頁）。回傳 {items, fromCache, at}；items 已疊上待上傳資料
export const defectsKey = (siteId, status) => `defects:${siteId}:${status || 'all'}`;
const matchStatus = status => d => !status || d.狀態 === status;

// 本機最新的資料：離線下載與清單快取取較新的一份
async function localDefects(siteId, status) {
  let c = null, o = null;
  try { c = await kv.get(defectsKey(siteId, status)); } catch {}
  o = await getSiteData(siteId);
  if (o && (!c || o.at >= c.at)) return { items: o.items.filter(matchStatus(status)), at: o.at, offline: true };
  return c ? { items: c.items, at: c.at } : null;
}

export async function cachedDefects(siteId, status) {
  const l = await localDefects(siteId, status);
  if (!l) {
    // 沒有任何快取：至少顯示待上傳的登記
    const ov = await overlay([], siteId, status);
    return ov.length ? { items: ov, at: Date.now() } : null;
  }
  return { ...l, items: await overlay(l.items, siteId, status) };
}

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
    upsertItems(siteId, items).catch(() => {});
    return { items: await overlay(items, siteId, status), fromCache: false };
  } catch (e) {
    if (e.network) { const c = await cachedDefects(siteId, status); if (c) return { ...c, fromCache: true }; }
    throw e;
  }
}

export function codeText(code) {
  if (!code) return '';
  const c = getState().codes.find(c => c.代碼 === code);
  return c ? c.內容 : '';
}

// 單筆：離線資料或清單快取（疊上待上傳）
export async function cachedDefect(id) {
  const site = getState().site;
  if (!site) return null;
  const user = getState().user;
  const { creates, fixes } = await pendingOverlay();
  const c = creates.find(x => x.缺失ID === id);
  if (c) return pendingDefect(c, user);
  let d = (await getSiteData(site.工地ID))?.items?.find(x => x.缺失ID === id);
  if (!d) for (const st of ['未改善', 'all', '待確認', '已結案']) {
    const cc = await kv.get(`defects:${site.工地ID}:${st}`).catch(() => null);
    d = cc?.items?.find(x => x.缺失ID === id);
    if (d) break;
  }
  return d ? applyFix(d, fixes.get(id), user) : null;
}

// 線上取得的單筆疊上待上傳的改善
export async function withPendingFix(d) {
  if (!d) return d;
  const { fixes } = await pendingOverlay();
  return applyFix(d, fixes.get(d.缺失ID), getState().user);
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
