// 登入：Google Identity Services 取 ID token；mock 模式選角色。
// 後端若在 me 回傳 sessionToken，之後改用它，避免每小時重新登入。
// 新版後端的 sessionToken 不設時效（sessionExp 為空）：沒有 exp 就視為不過期，
// 只有後端回 UNAUTHENTICATED（強制登出、停用帳號）才要求重新登入。
import { config, DEV_TOOLS } from './config.js';

const KEY = 'auth';
function read() { try { return JSON.parse(localStorage.getItem(KEY) || 'null'); } catch { return null; } }
function write(v) { try { v ? localStorage.setItem(KEY, JSON.stringify(v)) : localStorage.removeItem(KEY); } catch {} }

function jwtExp(token) {
  try {
    const p = JSON.parse(decodeURIComponent(escape(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')))));
    return { exp: p.exp * 1000, email: p.email, name: p.name };
  } catch { return { exp: Date.now() + 3600e3 }; }
}

export const auth = {
  current() {
    const a = read();
    if (!a) return null;
    if (a.kind === 'mock' && !DEV_TOOLS) return null; // 正式建置不接受示範登入
    if (a.exp && a.exp < Date.now() + 60e3) return { ...a, expired: true };
    return a;
  },
  // 離線時不因時間要求重新登入：有登入資料就先讓人用（連線後由後端判斷）
  usable() {
    const a = this.current();
    if (!a) return false;
    return !a.expired || (!navigator.onLine && !!(a.sessionToken || a.idToken || a.mockEmail));
  },
  token() {
    const a = this.current();
    if (!a) return null;
    // sessionToken 由後端判斷是否有效（舊格式到期時後端會回 UNAUTHENTICATED）
    if (a.sessionToken) return a.sessionToken;
    if (a.expired) return null;
    return a.idToken || a.mockEmail;
  },
  hint() { return read()?.email || ''; },
  setGoogle(idToken) { const j = jwtExp(idToken); write({ kind: 'google', idToken, exp: j.exp, email: j.email, name: j.name }); },
  setSession(sessionToken, expMs) {
    const a = read() || {};
    const exp = Number(expMs) > 0 ? Number(expMs) : null; // 空值＝不過期
    write({ ...a, sessionToken, exp });
  },
  setMock(email) { write({ kind: 'mock', mockEmail: email, email, exp: Date.now() + 30 * 86400e3 }); },
  logout() {
    const a = read();
    write(null);
    if (a?.kind === 'google' && window.google?.accounts?.id) window.google.accounts.id.disableAutoSelect();
  }
};

let gisP;
export function loadGis() {
  if (gisP) return gisP;
  gisP = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client';
    s.async = true;
    s.onload = () => resolve(window.google);
    s.onerror = () => { gisP = null; reject(new Error('無法載入 Google 登入（請確認網路）')); };
    document.head.appendChild(s);
  });
  return gisP;
}

export async function renderGoogleButton(el, onCredential) {
  const google = await loadGis();
  google.accounts.id.initialize({
    client_id: config.clientId,
    callback: r => onCredential(r.credential),
    auto_select: true,
    login_hint: auth.hint() || undefined,
    itp_support: true,
    cancel_on_tap_outside: false
  });
  google.accounts.id.renderButton(el, { theme: 'filled_blue', size: 'large', shape: 'pill', text: 'signin_with', locale: 'zh-TW', width: 280 });
  google.accounts.id.prompt();
}
