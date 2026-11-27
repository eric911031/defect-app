import { useEffect, useState } from 'preact/hooks';
import { useStore, toast } from '../store.js';
import { Header, Spinner, Modal, Chips } from '../components.jsx';
import { call, errText } from '../api.js';
import { loadCodes } from '../data.js';

// 名單管理的欄位定義
const SCHEMA = {
  工地: {
    key: '工地ID', title: r => r.名稱, sub: r => `${r.工地ID}${r.緯度 !== '' && r.緯度 != null ? '' : '・未設座標'}`,
    fields: [['工地ID', 'text'], ['名稱', 'text'], ['緯度', 'num'], ['經度', 'num'], ['允許半徑(公尺)', 'num'], ['棟別清單', 'text', 'A,B,C'], ['樓層範圍', 'text', '例如 2-23 或 B2-15'], ['戶別後綴清單', 'text', 'A1,A2,B1'], ['照片資料夾ID', 'text'], ['啟用', 'bool'], ['備註', 'text']]
  },
  使用者: {
    key: 'Email', title: r => `${r.姓名 || r.Email}`, sub: r => `${r.角色}・${r.公司 || ''}・${r.可用工地}`,
    fields: [['Email', 'email'], ['姓名', 'text'], ['公司', 'text'], ['角色', 'role'], ['可用工地', 'text', '工地ID 以逗號分隔，或「全部」'], ['啟用', 'bool']]
  },
  缺失代碼: {
    key: '代碼', title: r => `${r.代碼} ${r.內容 || ''}`, sub: r => `${r.分類 || ''}・${r.隸屬 || ''}`,
    fields: [['代碼', 'text'], ['分類', 'text'], ['內容', 'text'], ['種類', 'text'], ['隸屬', 'text'], ['說明圖', 'text'], ['啟用', 'bool']]
  }
};
const isOn = v => v === true || String(v).toUpperCase() === 'TRUE' || v === '是';

export function Manage() {
  const { user } = useStore();
  const [tab, setTab] = useState(() => sessionStorage.getItem('mgTab') || '使用者');
  const [rows, setRows] = useState(null);
  const [err, setErr] = useState('');
  const [q, setQ] = useState('');
  const [edit, setEdit] = useState(null);
  const sc = SCHEMA[tab];
  function load() { setRows(null); setErr(''); call('admin.list', { 分頁: tab }).then(setRows).catch(e => setErr(errText(e))); }
  useEffect(load, [tab]);
  // S1：強制這個人所有裝置重新登入（手機遺失、離職時用）
  async function revoke(r) {
    if (!navigator.onLine) return toast('需要網路才能強制重新登入', 'err');
    const self = r.Email === user.Email;
    if (!confirm(`強制「${r.姓名 || r.Email}」所有裝置重新登入？\n\n對方下次使用時要重新用 Google 登入，手機上待上傳的資料會保留，重新登入後自動補送。${self ? '\n\n注意：這是你自己的帳號，這支手機也會被登出。' : ''}`)) return;
    try {
      await call('admin.revokeUser', { Email: r.Email });
      toast(`已要求 ${r.姓名 || r.Email} 重新登入`, 'ok');
      load();
    } catch (e) { toast(errText(e), 'err'); }
  }
  const k = q.trim().toUpperCase();
  const shown = (rows || []).filter(r => !k || JSON.stringify(r).toUpperCase().includes(k));
  return (
    <>
      <Header title="名單管理" backTo="/more" />
      <main class="page">
        <Chips options={Object.keys(SCHEMA)} value={tab} onChange={v => { setTab(v); sessionStorage.setItem('mgTab', v); }} />
        <div class="filters">
          <input type="search" placeholder="搜尋" value={q} onInput={e => setQ(e.target.value)} />
          <button class="btn" onClick={() => setEdit({ 啟用: true })}>＋ 新增</button>
        </div>
        {err && <p class="err">{err}</p>}
        {!rows && !err && <Spinner />}
        <ul class="list">
          {shown.map(r => (
            <li class={tab === '使用者' ? 'row-wrap' : ''}><button class={'row' + (isOn(r.啟用) ? '' : ' disabled')} onClick={() => setEdit(r)}>
              <span class="dinfo"><b>{sc.title(r)}</b><small>{sc.sub(r)}</small></span>
              {!isOn(r.啟用) && <span class="pill">停用</span>}
            </button>
            {tab === '使用者' && <button class="side" onClick={() => revoke(r)} aria-label={`強制 ${r.Email} 重新登入`}>強制重新登入</button>}</li>
          ))}
        </ul>
      </main>
      {edit && <EditRow tab={tab} row={edit} isNew={!edit[sc.key]} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); load(); if (tab === '缺失代碼') loadCodes(); }} />}
    </>
  );
}

function EditRow({ tab, row, isNew, onClose, onSaved }) {
  const sc = SCHEMA[tab];
  const { user } = useStore();
  const [f, setF] = useState({ ...row });
  const [busy, setBusy] = useState(false);
  const set = (k, v) => setF(o => ({ ...o, [k]: v }));
  async function save() {
    if (!String(f[sc.key] || '').trim()) return toast(`請填${sc.key}`, 'err');
    const out = { ...f };
    for (const [k, t] of sc.fields) {
      if (t === 'bool') out[k] = isOn(out[k]);
      if (t === 'email') out[k] = String(out[k] || '').trim().toLowerCase();
    }
    if (tab === '缺失代碼') out.代碼 = String(out.代碼).toUpperCase().trim();
    setBusy(true);
    try { await call('admin.save', { 分頁: tab, 資料列: [out] }); toast('已儲存', 'ok'); onSaved(); }
    catch (e) { toast(errText(e), 'err'); setBusy(false); }
  }
  return (
    <Modal title={`${isNew ? '新增' : '編輯'}${tab}`} onClose={onClose} full>
      <div class="form">
        {sc.fields.map(([k, t, ph]) => (
          <label class="fld"><span>{k}</span>
            {t === 'bool' ? <label class="sw"><input type="checkbox" checked={isOn(f[k])} onChange={e => set(k, e.target.checked)} /> 啟用</label>
              : t === 'role' ? <Chips options={['登記者', '改善者', '管理者']} value={f[k]} onChange={v => set(k, v)} />
              : <input value={f[k] ?? ''} disabled={!isNew && k === sc.key} inputmode={t === 'num' ? 'decimal' : t === 'email' ? 'email' : undefined}
                  placeholder={ph || ''} onInput={e => set(k, e.target.value)} autocapitalize={t === 'email' ? 'off' : undefined} />}
          </label>
        ))}
        {tab === '工地' && <button type="button" class="btn ghost block" onClick={() => navigator.geolocation?.getCurrentPosition(p => { set('緯度', +p.coords.latitude.toFixed(6)); set('經度', +p.coords.longitude.toFixed(6)); toast('已填入目前位置', 'ok'); }, () => toast('無法取得定位', 'err'), { enableHighAccuracy: true })}>📍 用目前位置當工地座標</button>}
        {tab === '使用者' && f.Email && f.Email === user.Email && <p class="warn small">這是你自己的帳號，改角色或停用後可能無法再進入管理畫面。</p>}
        <button class="btn primary block" disabled={busy} onClick={save}>{busy ? '儲存中…' : '儲存'}</button>
      </div>
    </Modal>
  );
}
