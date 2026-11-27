import { useEffect, useState } from 'preact/hooks';
import { downloadAll, getMeta, offlineSites, fmtBytes, fmtDateTime } from '../offline.js';
import { errText } from '../api.js';
import { useStore, setState, toast } from '../store.js';
import { Header } from '../components.jsx';
import { auth } from '../auth.js';
import { config, VERSION } from '../config.js';
import { kv } from '../db.js';
import { go } from '../router.js';

export function More() {
  const { user, site, pending } = useStore();
  const admin = user.角色 === '管理者';
  function logout() {
    if (pending && !confirm(`還有 ${pending} 筆待上傳，登出後會保留在手機，下次登入再上傳。確定登出？`)) return;
    auth.logout(); kv.clear().catch(() => {}); setState({ user: null }); go('/');
  }
  return (
    <>
      <Header title="更多" />
      <main class="page">
        <div class="card me"><b>{user.姓名 || user.Email}</b><small>{user.Email}・{user.角色}{user.公司 ? '・' + user.公司 : ''}</small></div>
        <OfflineCard />
        <ul class="list menu">
          <li><a class="row" href="#/sites">切換工地<small>{site?.名稱}</small></a></li>
          <li><a class="row" href="#/queue">待上傳<small>{pending} 筆</small></a></li>
          {admin && <li><a class="row" href="#/report">產生 PDF 報告</a></li>}
          {admin && <li><a class="row" href="#/manage">名單管理（工地、使用者、代碼）</a></li>}
          <li><a class="row" href="#/help">加到主畫面說明</a></li>
          <li><a class="row" href="#/settings">設定</a></li>
          <li><button class="row bad" onClick={logout}>登出</button></li>
        </ul>
        <p class="muted small center">版本 {VERSION}{config.mock ? '・示範模式' : ''}</p>
      </main>
    </>
  );
}

export function Help() {
  return (
    <>
      <Header title="加到主畫面" backTo={-1} />
      <main class="page prose">
        <h3>iPhone（Safari）</h3>
        <ol><li>用 Safari 開啟這個網址。</li><li>點下方的「分享」按鈕（方框加向上箭頭）。</li><li>選「加入主畫面」，再按「加入」。</li><li>之後從主畫面的「缺失管理」圖示開啟。</li></ol>
        <h3>Android（Chrome）</h3>
        <ol><li>點右上角「⋮」。</li><li>選「安裝應用程式」或「加到主畫面」。</li></ol>
        <h3>第一次使用</h3>
        <ul><li>拍照時請允許使用相機。</li><li>請允許「位置」，系統會確認你在工地範圍內。若之前拒絕過：設定 › 隱私權與安全性 › 定位服務 › Safari 網站 › 使用 App 期間。</li></ul>
      </main>
    </>
  );
}

export function Settings() {
  const [api, setApi] = useState(localStorage.getItem('cfg.apiUrl') || '');
  const [cid, setCid] = useState(localStorage.getItem('cfg.clientId') || '');
  const [mock, setMock] = useState(config.mock && localStorage.getItem('cfg.mock') === '1');
  const [off, setOff] = useState(config.mockOffline);
  const [mgps, setMgps] = useState(config.mockGpsAtSite);
  function save() {
    config.set('apiUrl', api.trim()); config.set('clientId', cid.trim());
    config.set('mock', mock ? '1' : ''); config.set('mockOffline', off ? '1' : ''); config.set('mockGps', mgps ? '' : '0');
    kv.clear().catch(() => {});
    toast('已儲存，重新載入中', 'ok');
    setTimeout(() => location.reload(), 600);
  }
  async function clearCache() { await kv.clear(); toast('已清除快取（待上傳資料保留）', 'ok'); }
  return (
    <>
      <Header title="設定" backTo={-1} />
      <main class="page form">
        <p class="muted small">一般使用者不需要改這裡。留白代表用預設值{import.meta.env.VITE_API_URL ? '' : '（目前沒有預設後端，會使用示範資料）'}。</p>
        <label class="fld"><span>後端網址（Apps Script Web App）</span><input value={api} onInput={e => setApi(e.target.value)} placeholder="https://script.google.com/macros/s/…/exec" autocapitalize="off" /></label>
        <label class="fld"><span>Google 用戶端 ID</span><input value={cid} onInput={e => setCid(e.target.value)} placeholder="….apps.googleusercontent.com" autocapitalize="off" /></label>
        <label class="sw"><input type="checkbox" checked={mock} onChange={e => setMock(e.target.checked)} /> 強制使用示範資料</label>
        <fieldset class="card"><legend>示範模式測試選項</legend>
          <label class="sw"><input type="checkbox" checked={off} onChange={e => setOff(e.target.checked)} /> 模擬沒有網路（測試離線佇列）</label>
          <label class="sw"><input type="checkbox" checked={mgps} onChange={e => setMgps(e.target.checked)} /> GPS 直接用工地座標（關閉則用真實定位）</label>
        </fieldset>
        <button class="btn primary block" onClick={save}>儲存</button>
        <button class="btn ghost block" onClick={clearCache}>清除快取資料</button>
      </main>
    </>
  );
}

// O2 / O6：下載離線資料、顯示筆數、佔用空間與手機儲存用量
function OfflineCard() {
  const { user, online, offlineAt, offlineSyncing } = useStore();
  const [meta, setMeta] = useState(null);
  const [prog, setProg] = useState(null);
  const [est, setEst] = useState(null);
  const sites = offlineSites(user);
  const refresh = () => {
    getMeta().then(m => setMeta(m && m.email === user.Email ? m : null));
    if (navigator.storage?.estimate) navigator.storage.estimate().then(setEst).catch(() => {});
  };
  useEffect(refresh, [offlineAt]);
  async function run() {
    setProg({ i: 0, n: sites.length, count: 0, name: '' });
    try {
      const m = await downloadAll({ full: true, onProgress: p => setProg({ i: p.i, n: p.n, count: p.count, name: p.site.名稱 }) });
      toast(`已下載 ${m.total} 筆缺失（${sites.length} 個工地）`, 'ok');
    } catch (e) { toast('下載失敗：' + errText(e), 'err'); }
    finally { setProg(null); refresh(); }
  }
  const pct = prog ? Math.round(((prog.i + (prog.count ? 0.5 : 0)) / Math.max(1, prog.n)) * 100) : 0;
  return (
    <section class="card">
      <h3>離線資料</h3>
      <p class="muted small">下載後沒有網路也能看清單、明細與統計（只下載文字，照片要有網路才會顯示）。有網路開 App 時會自動更新。</p>
      {meta ? (
        <>
          <p class="small">上次下載：<b>{fmtDateTime(meta.at)}</b>・{meta.total} 筆・約 {fmtBytes(meta.bytes)}</p>
          <ul class="dl-sites">{Object.entries(meta.sites || {}).map(([id, x]) => <li><span>{x.名稱 || id}</span><span>{x.筆數} 筆</span></li>)}</ul>
        </>
      ) : <p class="small">還沒下載。</p>}
      {prog && <>
        <div class="meter" role="progressbar" aria-valuenow={pct} aria-valuemin="0" aria-valuemax="100"><span style={{ width: pct + '%' }} /></div>
        <p class="small muted">下載中：{prog.name}（{prog.i + 1}/{prog.n}）{prog.count ? `・${prog.count} 筆` : ''}</p>
      </>}
      <button class="btn primary block" disabled={!!prog || offlineSyncing || !online || !sites.length} onClick={run}>
        {prog ? '下載中…' : offlineSyncing ? '自動更新中…' : !online ? '沒有網路，無法下載' : meta ? '重新下載離線資料' : '下載離線資料'}
      </button>
      {est && est.quota ? <p class="muted small">這支手機給本 App 的空間：已用 {fmtBytes(est.usage)} / 可用 {fmtBytes(est.quota)}</p> : null}
    </section>
  );
}
