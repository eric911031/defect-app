// 全域狀態：簡單的訂閱式 store
import { useEffect, useState } from 'preact/hooks';

const state = {
  user: null,        // me 的回傳
  site: null,        // 目前工地物件
  codes: [],
  pending: 0,        // 待上傳筆數
  pendingFailed: 0,
  pendingOld: 0,     // 超過 24 小時未送出的待上傳筆數
  offlineAt: 0,      // 上次下載離線資料的時間
  offlineSyncing: false,
  online: navigator.onLine,
  syncing: false,
  toast: null,
  needLogin: false
};
const subs = new Set();

export function getState() { return state; }
export function setState(patch) {
  Object.assign(state, typeof patch === 'function' ? patch(state) : patch);
  subs.forEach(f => f());
}
export function useStore(sel = s => s) {
  const [, force] = useState(0);
  useEffect(() => { const f = () => force(x => x + 1); subs.add(f); return () => subs.delete(f); }, []);
  return sel(state);
}

let toastTimer;
export function toast(msg, kind = 'info', ms = 2600) {
  clearTimeout(toastTimer);
  setState({ toast: { msg, kind } });
  toastTimer = setTimeout(() => setState({ toast: null }), ms);
}
