// 設定值：建置時的環境變數，可被「設定」頁存在 localStorage 的值覆蓋。
// 安全（S3）：
// - 正式建置只有管理者登入後才能開「設定」頁（見 App.jsx）。
// - 後端網址只接受 https://script.google.com/macros/s/… 開頭；不合格的覆蓋值一律忽略（手機上舊的值也一樣）。
// - 示範（假資料）模式只在開發建置（npm run dev）或 `npm run build:demo` 出現，正式建置完全不會載入。
function ls(key) { try { return localStorage.getItem(key) || ''; } catch { return ''; } }

// 開發或示範建置才允許假資料與測試選項
export const DEV_TOOLS = import.meta.env.DEV || import.meta.env.VITE_ALLOW_MOCK === '1';

// Google 登入用戶端 ID（公開值，不是密碼）
const DEFAULT_CLIENT_ID = '986400221659-5q8lb0cilanjnrd3k0nncjs63diov3b5.apps.googleusercontent.com';
// 後端 Web App 網址（也可用 repo 變數 VITE_API_URL 覆蓋）
const DEFAULT_API_URL = 'https://script.google.com/macros/s/AKfycbxPcIAfqwQHYu3MVr6lk67QjCZuf7oLNfk2r8oiKuGGLq1cwSGR2w1WQR34JB04o8uR/exec';

const API_RE = /^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/(exec|dev)$/;
const CLIENT_RE = /^[0-9]+-[a-z0-9]+\.apps\.googleusercontent\.com$/;
export const validApiUrl = u => API_RE.test(String(u || '').trim());
export const validClientId = id => CLIENT_RE.test(String(id || '').trim());

export const config = {
  get apiUrl() {
    const o = ls('cfg.apiUrl');
    if (o && validApiUrl(o)) return o;
    const env = import.meta.env.VITE_API_URL;
    return env && validApiUrl(env) ? env : DEFAULT_API_URL;
  },
  get clientId() {
    const o = ls('cfg.clientId');
    if (o && validClientId(o)) return o;
    return import.meta.env.VITE_GOOGLE_CLIENT_ID || DEFAULT_CLIENT_ID;
  },
  // 手機上有沒有改過的設定（登入頁可「恢復預設」）
  get overridden() { return !!(ls('cfg.apiUrl') || ls('cfg.clientId')); },
  get mock() { return DEV_TOOLS && ls('cfg.mock') === '1'; },
  get mockOffline() { return DEV_TOOLS && ls('cfg.mockOffline') === '1'; },
  get mockGpsAtSite() { return ls('cfg.mockGps') !== '0'; },
  set(key, val) { try { val ? localStorage.setItem('cfg.' + key, val) : localStorage.removeItem('cfg.' + key); } catch {} },
  reset() { for (const k of ['apiUrl', 'clientId', 'mock', 'mockOffline', 'mockGps']) this.set(k, ''); }
};

export const STATUS = ['未改善', '待確認', '已結案'];
export const POSITIONS = ['上', '下', '左', '右', '四周', '固定壓條', '外', '內'];
export const VERSION = '0.2.0';
