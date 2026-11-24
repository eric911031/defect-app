// 假資料後端：依 API 合約實作，W2 完成前供開發與展示用。資料只存在記憶體，重新整理會重置。
import { ApiError } from './api.js';
import { haversine, today, normUnit, normCode } from './util.js';

export const MOCK_USERS = [
  { Email: 'admin@test', 姓名: '王管理', 公司: '總公司', 角色: '管理者', 可用工地: '全部', 啟用: true },
  { Email: 'reg@test', 姓名: '陳登記', 公司: '總公司', 角色: '登記者', 可用工地: 'DY,BQ', 啟用: true },
  { Email: 'fix@test', 姓名: '林師傅', 公司: '永和鋁窗', 角色: '改善者', 可用工地: 'DY,WG', 啟用: true }
];

const db = {
  工地: [
    { 工地ID: 'DY', 名稱: '敦仰', 緯度: 25.0418, 經度: 121.5520, '允許半徑(公尺)': 300, 棟別清單: 'A,B', 樓層範圍: '2-23', 戶別後綴清單: 'A1,A2,A3,A5,B1,B2', 照片資料夾ID: '', 啟用: true, 備註: '' },
    { 工地ID: 'BQ', 名稱: '板橋介壽', 緯度: 25.0105, 經度: 121.4628, '允許半徑(公尺)': 300, 棟別清單: 'A,B,C', 樓層範圍: '2-15', 戶別後綴清單: '1,2,3,5,6', 照片資料夾ID: '', 啟用: true, 備註: '' },
    { 工地ID: 'S13', 唯讀: true, 名稱: '漢皇開雲', 緯度: null, 經度: null, '允許半徑(公尺)': null, 棟別清單: '', 樓層範圍: '', 戶別後綴清單: '', 照片資料夾ID: '', 啟用: false, 備註: '舊建案' },
    { 工地ID: 'WG', 名稱: '五股中興', 緯度: null, 經度: null, '允許半徑(公尺)': null, 棟別清單: 'A,B,C,D', 樓層範圍: '1-12', 戶別後綴清單: '', 照片資料夾ID: '', 啟用: true, 備註: '未設座標，不檢查 GPS' }
  ],
  使用者: MOCK_USERS.map(u => ({ ...u })),
  缺失代碼: [
    ['A01', '玻璃', '玻璃刮傷'], ['A02', '玻璃', '玻璃破裂'], ['A05', '五金', '把手鬆動'], ['A08', '五金', '月牙鎖卡'],
    ['A11', '打膠', '外框打膠不均'], ['A15', '壓條', '缺壓條'], ['A20', '紗窗', '紗網破損'], ['A23', '框料', '框料凹傷'],
    ['A31', '排水', '排水孔堵塞'], ['A40', '壓條', '壓條沒打膠'], ['A52', '開關', '開關卡'], ['B03', '工地', '保護膜未撕'],
    ['B07', '工地', '水泥殘留'], ['C02', '工廠', '尺寸錯誤']
  ].map(([代碼, 分類, 內容]) => ({ 代碼, 分類, 內容, 種類: 分類, 隸屬: 代碼[0] === 'A' ? '不二' : 代碼[0] === 'B' ? '工地' : '工廠', 說明圖: '', 啟用: true })),
  缺失: [],
  photos: {}
};

function photoSvg(text, hue) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600"><rect width="800" height="600" fill="hsl(${hue},35%,78%)"/><rect x="180" y="90" width="440" height="420" fill="none" stroke="hsl(${hue},30%,40%)" stroke-width="18"/><line x1="400" y1="90" x2="400" y2="510" stroke="hsl(${hue},30%,40%)" stroke-width="12"/><text x="400" y="575" font-size="40" text-anchor="middle" fill="#333" font-family="sans-serif">${text}</text></svg>`;
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
}

// 產生示範缺失
(function seed() {
  let n = 0;
  const rnd = (i, m) => (Math.sin(i * 9301 + 49297) * 233280) % m;
  const pick = (arr, i) => arr[((Math.floor(rnd(i, arr.length)) % arr.length) + arr.length) % arr.length];
  for (const site of db.工地) {
    if (site.啟用 === false) { /* 舊建案：已結案、無照片 */ }
    const blds = (site.棟別清單 || '-').split(','), sufs = site.戶別後綴清單 ? site.戶別後綴清單.split(',') : [''];
    for (let i = 0; i < 45; i++) {
      n++;
      const id = `seed-${site.工地ID}-${i}`;
      const st = site.啟用 === false || i % 5 === 0 ? '已結案' : i % 7 === 0 ? '待確認' : '未改善';
      const floor = 2 + ((Math.floor(rnd(n, 12)) % 12) + 12) % 12;
      const suf = pick(sufs, n + 3);
      const code = pick(db.缺失代碼, n + 7).代碼;
      db.photos[id + '前'] = photoSvg(`改善前 ${site.名稱} #${i + 1}`, 10);
      if (st !== '未改善') db.photos[id + '後'] = photoSvg(`改善後 ${site.名稱} #${i + 1}`, 130);
      db.缺失.push({
        缺失ID: id, 工地ID: site.工地ID, 棟: pick(blds, n + 1), 戶別: `${floor}F${suf ? '-' + suf : ''}`, 窗號: `W${1 + (i % 6)}`, 順序: 1 + (i % 3), 長度: '',
        位置: '', 代碼: code, 備註: i % 4 === 0 ? '客廳落地窗' : '', 狀態: st, 登記日期: `2026-11-${String(1 + (i % 20)).padStart(2, '0')}`, 登記人: 'reg@test', 登記GPS: '',
        改善前照片ID: id + '前', 改善後照片ID: st !== '未改善' ? id + '後' : '', 改善日期: st !== '未改善' ? '2026-11-21' : '', 改善人: st !== '未改善' ? 'fix@test' : '', 改善GPS: '',
        確認人: st === '已結案' ? 'admin@test' : '', 確認日期: st === '已結案' ? '2026-11-22' : '', 退回原因: i === 6 ? '照片看不清楚，請重拍' : '', 來源: '新系統', 原始位置: '', 更新時間: new Date().toISOString()
      });
    }
  }
})();

const wait = ms => new Promise(r => setTimeout(r, ms));
const codeMap = () => Object.fromEntries(db.缺失代碼.map(c => [c.代碼, c]));

function userOf(token) {
  const u = db.使用者.find(u => u.Email === token && u.啟用 !== false);
  if (!u) throw new ApiError('UNAUTHENTICATED', '請重新登入');
  return u;
}
function sitesOf(u) {
  const allow = String(u.可用工地 || '');
  return db.工地.filter(s => (s.啟用 !== false || u.角色 === '管理者') && (allow === '全部' || allow.split(',').map(x => x.trim()).includes(s.工地ID)));
}
function need(u, ...roles) { if (!roles.includes(u.角色)) throw new ApiError('FORBIDDEN', '沒有權限'); }
function siteCheck(u, siteId) {
  const s = sitesOf(u).find(s => s.工地ID === siteId);
  if (!s) throw new ApiError('FORBIDDEN', '沒有此工地的權限');
  return s;
}
function gpsCheck(site, gps) {
  if (site.緯度 == null || site.緯度 === '' || site.經度 == null || site.經度 === '') return;
  if (!gps) throw new ApiError('OUT_OF_RANGE', '沒有定位資料');
  const d = haversine(gps.lat, gps.lng, +site.緯度, +site.經度), r = +site['允許半徑(公尺)'] || 300;
  if (d > r) throw new ApiError('OUT_OF_RANGE', `距離工地 ${Math.round(d)} 公尺，超過允許的 ${r} 公尺`);
}
function view(d, withPhotos) {
  const c = codeMap()[d.代碼];
  const o = { ...d, 代碼內容: c ? c.內容 : '' };
  if (withPhotos) { o.改善前照片網址 = db.photos[d.改善前照片ID] || ''; o.改善後照片網址 = db.photos[d.改善後照片ID] || ''; }
  return o;
}
function find(id) { const d = db.缺失.find(x => x.缺失ID === id); if (!d) throw new ApiError('NOT_FOUND', '找不到這筆缺失'); return d; }
const now = () => new Date().toISOString();

export async function handle(action, data = {}, token) {
  await wait(250 + Math.random() * 250);
  const u = userOf(token);
  switch (action) {
    case 'me': return { Email: u.Email, 姓名: u.姓名, 公司: u.公司, 角色: u.角色, 工地: sitesOf(u) };
    case 'photos': { const out = {}; for (const id of data.檔案ID || []) out[id] = db.photos[id] || null; return out; }
    case 'codes': return db.缺失代碼.filter(c => c.啟用 !== false);
    case 'listDefects': {
      siteCheck(u, data.工地ID);
      let list = db.缺失.filter(d => d.工地ID === data.工地ID);
      if (u.角色 === '改善者') list = list.filter(d => d.狀態 === '未改善');
      else if (data.狀態) list = list.filter(d => d.狀態 === data.狀態);
      if (data.棟) list = list.filter(d => d.棟 === data.棟);
      if (data.戶別) list = list.filter(d => d.戶別 === normUnit(data.戶別));
      if (data.關鍵字) { const k = data.關鍵字.toUpperCase(); list = list.filter(d => JSON.stringify(view(d)).toUpperCase().includes(k)); }
      const per = data.每頁 || 200, page = data.頁 || 1;
      return { items: list.slice((page - 1) * per, page * per).map(d => view(d)), total: list.length };
    }
    case 'getDefect': { const d = find(data.缺失ID); siteCheck(u, d.工地ID); return view(d, true); }
    case 'createDefect': {
      need(u, '登記者', '管理者');
      const ex = db.缺失.find(x => x.缺失ID === data.缺失ID);
      if (ex) return view(ex);
      const site = siteCheck(u, data.工地ID);
      gpsCheck(site, data.GPS);
      if (!data.改善前照片) throw new ApiError('VALIDATION', '缺少改善前照片');
      db.photos[data.缺失ID + '前'] = 'data:image/jpeg;base64,' + data.改善前照片;
      const d = {
        缺失ID: data.缺失ID, 工地ID: data.工地ID, 棟: data.棟 || '', 戶別: normUnit(data.戶別), 窗號: data.窗號 || '', 順序: data.順序 || '', 長度: data.長度 || '',
        位置: data.位置 || '', 代碼: normCode(data.代碼), 備註: data.備註 || '', 狀態: '未改善', 登記日期: today(), 登記人: u.Email,
        登記GPS: data.GPS ? `${data.GPS.lat},${data.GPS.lng}` : '', 改善前照片ID: data.缺失ID + '前', 改善後照片ID: '', 改善日期: '', 改善人: '', 改善GPS: '',
        確認人: '', 確認日期: '', 退回原因: '', 來源: '新系統', 原始位置: '', 更新時間: now()
      };
      db.缺失.unshift(d);
      return view(d);
    }
    case 'submitFix': {
      need(u, '改善者', '管理者');
      const d = find(data.缺失ID); const site = siteCheck(u, d.工地ID);
      if (d.狀態 === '待確認' && d.改善人 === u.Email) return view(d); // 重送
      if (d.狀態 !== '未改善') throw new ApiError('INVALID_STATE', `目前狀態是「${d.狀態}」，不能回報改善`);
      gpsCheck(site, data.GPS);
      db.photos[d.缺失ID + '後'] = 'data:image/jpeg;base64,' + data.改善後照片;
      Object.assign(d, { 狀態: '待確認', 改善後照片ID: d.缺失ID + '後', 改善日期: today(), 改善人: u.Email, 改善GPS: data.GPS ? `${data.GPS.lat},${data.GPS.lng}` : '', 更新時間: now() });
      if (data.備註) d.備註 = (d.備註 ? d.備註 + '；' : '') + data.備註;
      return view(d);
    }
    case 'review': {
      need(u, '管理者');
      const d = find(data.缺失ID);
      if (d.狀態 !== '待確認') throw new ApiError('INVALID_STATE', `目前狀態是「${d.狀態}」`);
      if (data.結果 === '通過') Object.assign(d, { 狀態: '已結案', 確認人: u.Email, 確認日期: today(), 退回原因: '' });
      else if (data.結果 === '退回') {
        if (!data.退回原因) throw new ApiError('VALIDATION', '請填退回原因');
        Object.assign(d, { 狀態: '未改善', 退回原因: data.退回原因, 確認人: u.Email, 確認日期: today() });
      } else throw new ApiError('VALIDATION', '結果只能是通過或退回');
      d.更新時間 = now();
      return view(d);
    }
    case 'updateDefect': {
      need(u, '管理者');
      const d = find(data.缺失ID);
      const allowed = ['棟', '戶別', '窗號', '順序', '長度', '位置', '代碼', '備註'];
      for (const k of allowed) if (data.欄位 && k in data.欄位) d[k] = k === '戶別' ? normUnit(data.欄位[k]) : k === '代碼' ? normCode(data.欄位[k]) : data.欄位[k];
      d.更新時間 = now();
      return view(d);
    }
    case 'stats': {
      need(u, '管理者');
      const list = db.缺失.filter(d => !data.工地ID || d.工地ID === data.工地ID);
      const 狀態 = { 未改善: 0, 待確認: 0, 已結案: 0 };
      const codes = {}, blds = {};
      for (const d of list) {
        狀態[d.狀態] = (狀態[d.狀態] || 0) + 1;
        if (d.代碼) codes[d.代碼] = (codes[d.代碼] || 0) + 1;
        const b = blds[d.棟 || '（未分棟）'] ||= { 棟: d.棟 || '（未分棟）', 未改善: 0, 待確認: 0, 已結案: 0 };
        b[d.狀態]++;
      }
      const cm = codeMap();
      return {
        狀態,
        代碼排名: Object.entries(codes).map(([代碼, 數量]) => ({ 代碼, 內容: cm[代碼]?.內容 || '', 數量 })).sort((a, b) => b.數量 - a.數量),
        各棟: Object.values(blds).sort((a, b) => a.棟.localeCompare(b.棟))
      };
    }
    case 'generateReport': {
      need(u, '管理者'); siteCheck(u, data.工地ID);
      await wait(1500);
      return { 報告ID: 'R' + Date.now(), url: 'https://drive.google.com/', PDF檔案ID: 'mock' };
    }
    case 'admin.list': { need(u, '管理者'); return (db[data.分頁] || []).map(r => ({ ...r })); }
    case 'admin.save': {
      need(u, '管理者');
      const key = { 工地: '工地ID', 使用者: 'Email', 缺失代碼: '代碼' }[data.分頁];
      if (!key) throw new ApiError('VALIDATION', '不支援的分頁');
      const out = [];
      for (const row of data.資料列 || []) {
        if (!row[key]) throw new ApiError('VALIDATION', `缺少${key}`);
        const i = db[data.分頁].findIndex(r => r[key] === row[key]);
        if (i >= 0) db[data.分頁][i] = { ...db[data.分頁][i], ...row }; else db[data.分頁].push({ ...row });
        out.push(row);
      }
      return out;
    }
    default: throw new ApiError('VALIDATION', '未知的 action：' + action);
  }
}
