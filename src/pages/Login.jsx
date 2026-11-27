import { useEffect, useRef, useState } from 'preact/hooks';
import { auth, renderGoogleButton } from '../auth.js';
import { config, DEV_TOOLS } from '../config.js';

export function Login({ onLogin, expired }) {
  const btn = useRef();
  const [err, setErr] = useState('');
  const [mockUsers, setMockUsers] = useState(null);
  useEffect(() => {
    if (DEV_TOOLS && config.mock) { import('../mock.js').then(m => setMockUsers(m.MOCK_USERS)); return; }
    if (!config.clientId) return;
    renderGoogleButton(btn.current, cred => { auth.setGoogle(cred); onLogin(); }).catch(e => setErr(e.message));
  }, []);
  function resetCfg() {
    if (!confirm('把這支手機上改過的設定（後端網址、用戶端 ID）恢復成預設值？')) return;
    config.reset(); location.reload();
  }
  return (
    <div class="login">
      <img src="icon-192.png" width="72" height="72" alt="" />
      <h1>工地缺失管理</h1>
      {expired && <p class="warn">登入已失效，請重新登入。待上傳的資料都還在，登入後會自動補送。</p>}
      {DEV_TOOLS && config.mock ? (
        <div class="card">
          <p class="muted">示範模式（資料為假資料）。請選擇要試用的角色：</p>
          {(mockUsers || []).map(u => (
            <button class="btn block" onClick={() => { auth.setMock(u.Email); onLogin(); }}>{u.角色}・{u.姓名}</button>
          ))}
        </div>
      ) : (
        <>
          <p class="muted">請用公司登記的 Google 帳號登入</p>
          <div ref={btn} class="gbtn" />
        </>
      )}
      {err && <p class="err">{err}</p>}
      {DEV_TOOLS ? <p class="foot"><a href="#/settings">設定</a></p>
        : config.overridden ? <p class="foot"><button class="link" onClick={resetCfg}>登入不了？恢復預設設定</button></p> : null}
    </div>
  );
}
