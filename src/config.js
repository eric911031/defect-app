// 設定值：建置時的環境變數，可被「設定」頁存在 localStorage 的值覆蓋（方便測試）
function ls(key) { try { return localStorage.getItem(key) || ''; } catch { return ''; } }

export const config = {
  get apiUrl() { return ls('cfg.apiUrl') || import.meta.env.VITE_API_URL || ''; },
  get clientId() { return ls('cfg.clientId') || import.meta.env.VITE_GOOGLE_CLIENT_ID || ''; },
  // 沒有設定 API 網址時自動使用假資料
  get mock() { return ls('cfg.mock') === '1' || !this.apiUrl; },
  get mockOffline() { return ls('cfg.mockOffline') === '1'; },
  get mockGpsAtSite() { return ls('cfg.mockGps') !== '0'; },
  set(key, val) { try { val ? localStorage.setItem('cfg.' + key, val) : localStorage.removeItem('cfg.' + key); } catch {} }
};

export const STATUS = ['未改善', '待確認', '已結案'];
export const POSITIONS = ['上', '下', '左', '右', '四周', '固定壓條', '外', '內'];
export const VERSION = '0.1.0';
