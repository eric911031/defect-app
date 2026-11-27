// 登出與換帳號（S5）。使用者表示沒有共用手機，所以不做更嚴格的共用手機模式。
import { auth } from './auth.js';
import { call } from './api.js';
import { kv, queueStore } from './db.js';
import { setState, getState } from './store.js';
import { refreshCount, isMine } from './queue.js';

const LAST = 'lastUser';
const lsGet = k => { try { return localStorage.getItem(k) || ''; } catch { return ''; } };

// 這支手機上屬於某人的資料：快取（kv）、報告進度、清單篩選、照片快取。待上傳資料另外處理。
export async function clearUserData() {
  await kv.clear().catch(() => {});
  try {
    for (const k of Object.keys(localStorage)) if (k.startsWith('report:') || k === 'recentCodes') localStorage.removeItem(k);
    sessionStorage.clear();
  } catch {}
  try { if (window.caches) await caches.delete('photos'); } catch {}
  setState({ offlineAt: 0, codes: [] });
}

// 登入成功後呼叫：和上一次登入的不是同一人就清掉前一人的快取
export async function switchUser(me) {
  const prev = lsGet(LAST);
  if (me?.Email && prev && prev !== me.Email) {
    await clearUserData();
    await kv.set('me', me).catch(() => {});
  }
  if (me?.Email) try { localStorage.setItem(LAST, me.Email); } catch {}
}

export async function myPending() {
  const email = getState().user?.Email;
  return (await queueStore.all()).filter(i => isMine(i, email));
}

// discard：放棄並清除自己的待上傳。後端 logout 會讓這個帳號所有裝置的登入失效。
export async function logout({ discard = false } = {}) {
  if (discard) for (const it of await myPending()) await queueStore.del(it.id);
  if (navigator.onLine) { try { await call('logout'); } catch { /* 網路或憑證已失效：本機照樣登出 */ } }
  auth.logout();
  await clearUserData();
  setState({ user: null, site: null, needLogin: false });
  await refreshCount().catch(() => {});
}
