// 離線資料：把自己可用工地的「全部缺失文字資料」下載到手機（不含照片）。
// 每個工地存一份 kv `offline:<工地ID>` = { items, at, fullAt, serverTime }。
// 後端支援增量（listDefects 帶 `更新於之後`、回傳 serverTime）時只抓變動；
// 不支援時（沒有 serverTime）一律全量。每天至少全量一次，處理被刪除或移出權限的資料。
import { call } from './api.js';
import { kv, queueStore } from './db.js';
import { getState, setState } from './store.js';

const KEY = id => 'offline:' + id;
const META = 'offline:meta';
const DAY = 86400e3;
const AUTO_FULL_GAP = 30 * 60e3; // 後端不支援增量時，自動更新最多每 30 分鐘全量一次

export const offlineSites = user => (user?.工地 || []).filter(s => !(s.唯讀 === true || s.啟用 === false));

export async function getSiteData(siteId) { try { return await kv.get(KEY(siteId)); } catch { return null; } }
export async function getMeta() { try { return (await kv.get(META)) || null; } catch { return null; } }

async function fetchAll(siteId, since, onPage) {
  const per = 1000; let page = 1, items = [], serverTime = null, removedIds = null, ids = null;
  for (;;) {
    const q = { 工地ID: siteId, 頁: page, 每頁: per };
    if (since) q.更新於之後 = since;
    const r = await call('listDefects', q);
    const batch = Array.isArray(r) ? r : r.items || [];
    if (!Array.isArray(r)) {
      if (r.serverTime && !serverTime) serverTime = r.serverTime;
      if (Array.isArray(r.removedIds)) removedIds = (removedIds || []).concat(r.removedIds);
      if (Array.isArray(r.ids) && !ids) ids = r.ids; // 增量時：此工地目前看得到的全部 ID（不分頁）
    }
    items = items.concat(batch);
    onPage && onPage(items.length, Array.isArray(r) ? null : r.total);
    const total = Array.isArray(r) ? batch.length : (r.total ?? batch.length);
    if (batch.length < per || items.length >= total) break;
    page++;
  }
  return { items, serverTime, removedIds, ids };
}

// 下載（或更新）一個工地。mode: 'full' | 'auto'
export async function syncSite(siteId, { mode = 'auto', onPage } = {}) {
  const old = await getSiteData(siteId);
  const now = Date.now();
  const fixer = getState().user?.角色 === '改善者';
  const canInc = mode !== 'full' && old && old.serverTime && old.fullAt && now - old.fullAt < DAY;
  if (canInc) {
    const r = await fetchAll(siteId, old.serverTime, onPage);
    if (r.serverTime) {
      const map = new Map(old.items.map(d => [d.缺失ID, d]));
      for (const d of r.items) map.set(d.缺失ID, d);
      for (const id of r.removedIds || []) map.delete(id);
      if (r.ids) {
        // 本機沒有的 ID（例如 AppSheet 新增、沒更新「更新時間」）：改成全量
        if (r.ids.some(id => !map.has(id))) return syncSite(siteId, { mode: 'full', onPage });
        const keep = new Set(r.ids);
        for (const id of [...map.keys()]) if (!keep.has(id)) map.delete(id);
      }
      let items = [...map.values()];
      if (fixer) items = items.filter(d => d.狀態 === '未改善');
      const v = { items, at: now, fullAt: old.fullAt, serverTime: r.serverTime, inc: true };
      await kv.set(KEY(siteId), v);
      return { ...v, changed: r.items.length + (r.removedIds?.length || 0) };
    }
    // 後端沒回 serverTime：當作全量結果
    const v = { items: r.items, at: now, fullAt: now, serverTime: null };
    await kv.set(KEY(siteId), v);
    return { ...v, changed: r.items.length };
  }
  const r = await fetchAll(siteId, null, onPage);
  const v = { items: r.items, at: now, fullAt: now, serverTime: r.serverTime || null };
  await kv.set(KEY(siteId), v);
  return { ...v, changed: r.items.length };
}

// 「下載離線資料」：全部可用工地；onProgress({site, i, n, count})
export async function downloadAll({ full = true, onProgress } = {}) {
  const sites = offlineSites(getState().user);
  const meta = { at: 0, sites: {}, email: getState().user?.Email || '' };
  let total = 0;
  for (let i = 0; i < sites.length; i++) {
    const s = sites[i];
    onProgress && onProgress({ site: s, i, n: sites.length, count: 0 });
    const r = await syncSite(s.工地ID, { mode: full ? 'full' : 'auto', onPage: c => onProgress && onProgress({ site: s, i, n: sites.length, count: c }) });
    meta.sites[s.工地ID] = { 名稱: s.名稱, 筆數: r.items.length, bytes: approxBytes(r.items), at: r.at };
    total += r.items.length;
  }
  meta.at = Date.now(); meta.total = total;
  meta.bytes = Object.values(meta.sites).reduce((a, x) => a + x.bytes, 0);
  await kv.set(META, meta);
  setState({ offlineAt: meta.at });
  return meta;
}

// 開 App 且有網路時：曾經下載過才自動更新（增量；後端不支援時節流全量）
let autoRunning = null;
export function autoUpdate() {
  if (autoRunning || !navigator.onLine) return autoRunning;
  autoRunning = (async () => {
    try {
      const meta = await getMeta();
      if (!meta || !meta.at) return null;
      if (meta.email && meta.email !== getState().user?.Email) return null;
      const anyInc = await Promise.all(Object.keys(meta.sites || {}).map(getSiteData)).then(l => l.some(x => x?.serverTime));
      if (!anyInc && Date.now() - meta.at < AUTO_FULL_GAP) return null;
      setState({ offlineSyncing: true });
      return await downloadAll({ full: false });
    } catch { return null; }
    finally { if (getState().offlineSyncing) setState({ offlineSyncing: false }); autoRunning = null; }
  })();
  return autoRunning;
}

// 線上取得的資料順便更新離線資料（只覆蓋同 ID，不刪除）
export async function upsertItems(siteId, list) {
  if (!list || !list.length) return;
  const old = await getSiteData(siteId);
  if (!old) return;
  const map = new Map(old.items.map(d => [d.缺失ID, d]));
  for (const d of list) if (d && d.缺失ID) map.set(d.缺失ID, { ...map.get(d.缺失ID), ...stripPhotos(d) });
  await kv.set(KEY(siteId), { ...old, items: [...map.values()] });
}
const stripPhotos = d => { const { 改善前照片網址, 改善後照片網址, ...rest } = d; return rest; };

export function approxBytes(v) { try { return new Blob([JSON.stringify(v)]).size; } catch { return JSON.stringify(v).length * 2; } }
export function fmtBytes(b) {
  if (!b && b !== 0) return '—';
  if (b < 1024) return b + ' B';
  if (b < 1024 * 1024) return (b / 1024).toFixed(0) + ' KB';
  if (b < 1024 ** 3) return (b / 1024 / 1024).toFixed(1) + ' MB';
  return (b / 1024 ** 3).toFixed(2) + ' GB';
}
export function fmtDateTime(ts) {
  const d = new Date(ts), p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}/${p(d.getMonth() + 1)}/${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

// ---- 待上傳資料疊到清單上（O3） ----
export const DATA_URL = b64 => 'data:image/jpeg;base64,' + b64;

export async function pendingOverlay() {
  let q = [];
  try { q = await queueStore.all(); } catch {}
  const creates = q.filter(i => i.action === 'createDefect').map(i => i.data);
  const fixes = new Map(q.filter(i => i.action === 'submitFix').map(i => [i.data.缺失ID, i.data]));
  return { creates, fixes };
}

export function pendingDefect(data, user) {
  const { 改善前照片, GPS, ...rest } = data;
  return {
    ...rest, 狀態: '未改善', 登記人: user?.Email || '', 登記日期: data.登記日期 || '',
    改善前照片ID: '', 改善前縮圖網址: 改善前照片 ? DATA_URL(改善前照片) : '', 改善前照片網址: 改善前照片 ? DATA_URL(改善前照片) : '',
    _pending: '登記'
  };
}
export function applyFix(d, fix, user) {
  if (!fix || d.狀態 !== '未改善') return d;
  return { ...d, 狀態: '待確認', 改善日期: fix.改善日期 || '', 改善人: user?.Email || '', 改善後照片ID: '', 改善後照片網址: fix.改善後照片 ? DATA_URL(fix.改善後照片) : '', 退回原因: d.退回原因, _pending: '改善' };
}

// items：某工地、某狀態（'' 代表全部）的伺服器資料；回傳疊上待上傳後的清單
export async function overlay(items, siteId, status, extraBase) {
  const { creates, fixes } = await pendingOverlay();
  if (!creates.length && !fixes.size) return items;
  const user = getState().user;
  const ids = new Set(items.map(d => d.缺失ID));
  let out = items.map(d => applyFix(d, fixes.get(d.缺失ID), user));
  // 待確認清單：補上已回報改善但還沒上傳的（從離線資料找原始那筆）
  if (status === '待確認' && fixes.size) {
    const base = extraBase || (await getSiteData(siteId))?.items || [];
    for (const [id, fx] of fixes) if (!ids.has(id)) { const b = base.find(d => d.缺失ID === id); if (b) { out.push(applyFix(b, fx, user)); ids.add(id); } }
  }
  if (!status || status === '未改善') {
    for (const c of creates) if (c.工地ID === siteId && !ids.has(c.缺失ID)) out.unshift(pendingDefect(c, user));
  }
  return out;
}

// ---- 離線統計（O7）：與後端 stats 相同欄位 ----
export function computeStats(rows, codes, withSites) {
  const STS = ['未改善', '待確認', '已結案'];
  const blank = () => ({ 未改善: 0, 待確認: 0, 已結案: 0 });
  const status = blank(), byCode = {}, byBlk = {}, bySite = {};
  const norm = s => String(s || '').toUpperCase().replace(/\s+/g, '');
  for (const d of rows) {
    const st = d.狀態;
    if (!STS.includes(st)) continue;
    status[st]++;
    const c = norm(d.代碼);
    if (c) byCode[c] = (byCode[c] || 0) + 1;
    const b = String(d.棟 || '').trim() || '（未分棟）';
    (byBlk[b] ||= blank())[st]++;
    const s = String(d.工地ID || '');
    (bySite[s] ||= blank())[st]++;
  }
  const withTotal = (key, name, o) => { const t = o.未改善 + o.待確認 + o.已結案; return { [key]: name, ...o, 總數: t, 完成率: t ? Math.round((o.已結案 / t) * 1000) / 10 : 0 }; };
  const cmap = Object.fromEntries((codes || []).map(c => [norm(c.代碼), c]));
  const nat = (a, b) => String(a).localeCompare(String(b), 'zh', { numeric: true });
  const out = {
    總數: status.未改善 + status.待確認 + status.已結案,
    狀態: status,
    代碼排名: Object.keys(byCode).map(c => ({ 代碼: c, 內容: cmap[c]?.內容 || '', 數量: byCode[c] })).sort((a, b) => b.數量 - a.數量 || (a.代碼 < b.代碼 ? -1 : 1)).slice(0, 30),
    各棟: Object.keys(byBlk).sort(nat).map(b => withTotal('棟', b, byBlk[b]))
  };
  if (withSites) out.各工地 = Object.keys(bySite).sort().map(s => withTotal('工地ID', s, bySite[s]));
  return out;
}

// siteId 省略＝全部已下載的工地。回傳 { data, at } 或 null
export async function offlineStats(siteId) {
  const ids = siteId ? [siteId] : Object.keys((await getMeta())?.sites || {});
  let rows = [], at = Infinity, found = false;
  for (const id of ids) {
    const s = await getSiteData(id);
    if (!s) continue;
    found = true; rows = rows.concat(s.items); at = Math.min(at, s.at);
  }
  if (!found) return null;
  return { data: computeStats(rows, getState().codes, !siteId), at };
}
