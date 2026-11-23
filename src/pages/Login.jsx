import { useEffect, useRef, useState } from 'preact/hooks';
import { auth, renderGoogleButton } from '../auth.js';
import { config } from '../config.js';
import { MOCK_USERS } from '../mock.js';

export function Login({ onLogin, expired }) {
  const btn = useRef();
  const [err, setErr] = useState('');
  useEffect(() => {
    if (config.mock || !config.clientId) return;
    renderGoogleButton(btn.current, cred => { auth.setGoogle(cred); onLogin(); }).catch(e => setErr(e.message));
  }, []);
  return (
    <div class="login">
      <img src="icon-192.png" width="72" height="72" alt="" />
      <h1>工地缺失管理</h1>
      {expired && <p class="warn">登入已過期，請重新登入。待上傳的資料都還在，登入後會自動補送。</p>}
      {config.mock ? (
        <div class="card">
          <p class="muted">示範模式（尚未連接後端，資料為假資料）。請選擇要試用的角色：</p>
          {MOCK_USERS.map(u => (
            <button class="btn block" onClick={() => { auth.setMock(u.Email); onLogin(); }}>{u.角色}・{u.姓名}</button>
          ))}
        </div>
      ) : !config.clientId ? (
        <p class="warn">尚未設定 Google 用戶端 ID，請到 <a href="#/settings">設定</a>。</p>
      ) : (
        <>
          <p class="muted">請用公司登記的 Google 帳號登入</p>
          <div ref={btn} class="gbtn" />
        </>
      )}
      {err && <p class="err">{err}</p>}
      <p class="foot"><a href="#/settings">設定</a></p>
    </div>
  );
}
