import { useEffect, useState } from 'preact/hooks';
import { useStore, toast } from '../store.js';
import { Header, Spinner, StatusPill, PhotoInput, GpsLine, useGps, Modal, CodePicker, Chips, Thumb } from '../components.jsx';
import { call, errText } from '../api.js';
import { codeText } from '../data.js';
import { enqueue, flush, enqueueAndSend } from '../queue.js';
import { go } from '../router.js';
import { POSITIONS } from '../config.js';
import { today, isReadOnly } from '../util.js';
import { cachedDefect, withPendingFix } from '../data.js';
import { removeLocal } from '../offline.js';

export function useDefect(id) {
  const [d, setD] = useState(null);
  const [err, setErr] = useState('');
  useEffect(() => {
    setD(null); setErr('');
    let live = true;
    const tryLocal = async () => { const c = await cachedDefect(id); if (c && live) { setD(c._pending === '登記' ? c : { ...c, 離線: true }); return true; } return false; };
    call('getDefect', { 缺失ID: id }).then(async x => live && setD(await withPendingFix(x))).catch(async e => {
      // 離線時改用離線資料／清單快取，讓改善者仍可拍照回報（照片稍後補送）
      // 還沒上傳的登記在伺服器上找不到（NOT_FOUND）：顯示手機上的版本
      if ((e.network || e.code === 'NOT_FOUND') && await tryLocal()) return;
      live && setErr(errText(e));
    });
    return () => { live = false; };
  }, [id]);
  return { d, setD, err };
}

export function Photos({ d }) {
  const [zoom, setZoom] = useState(null);
  const before = d.改善前照片網址 || d.改善前縮圖網址;
  const after = d.改善後照片網址;
  return (
    <div class="pair">
      <figure onClick={e => setZoom(before || e.target.src)}>{before || d.改善前照片ID ? <Thumb url={before} fileId={d.改善前照片ID} cls="pimg" /> : <div class="nophoto">無照片</div>}<figcaption>改善前</figcaption></figure>
      <figure onClick={e => setZoom(after || e.target.src)}>{after || d.改善後照片ID ? <Thumb url={after} fileId={d.改善後照片ID} cls="pimg" /> : <div class="nophoto">尚未改善</div>}<figcaption>改善後</figcaption></figure>
      {zoom && zoom.startsWith && !zoom.endsWith('/') && <div class="zoom" onClick={() => setZoom(null)}><img src={zoom} alt="" /></div>}
    </div>
  );
}

export function Detail({ id }) {
  const { user, site } = useStore();
  const ro = isReadOnly(site);
  const { d, setD, err } = useDefect(id);
  const [rejecting, setRejecting] = useState(false);
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const role = user.角色;
  if (err) return <><Header title="缺失" backTo={-1} /><main class="page"><p class="err">{err}</p></main></>;
  if (!d) return <><Header title="缺失" backTo={-1} /><main class="page"><Spinner /></main></>;
  const rows = [
    ['棟 / 戶別', `${d.棟 ? d.棟 + '棟 ' : ''}${d.戶別}`], ['窗號 / 順序', `${d.窗號 || '—'} / ${d.順序 || '—'}`],
    ['代碼', d.代碼 ? `${d.代碼} ${d.代碼內容 || codeText(d.代碼)}` : '—'], ['位置 / 長度', `${d.位置 || '—'} / ${d.長度 || '—'}`],
    ['備註', d.備註 || '—'], ['登記', `${d.登記日期} ${d.登記人}`],
    d.改善日期 && ['改善', `${d.改善日期} ${d.改善人}`], d.確認日期 && ['確認', `${d.確認日期} ${d.確認人}`],
    d.退回原因 && ['退回原因', d.退回原因], d.來源 && d.來源 !== '新系統' && ['來源', `${d.來源} ${d.原始位置 || ''}`]
  ].filter(Boolean);

  async function review(結果, 退回原因) {
    setRejecting(false);
    const r = await sendReview(d, 結果, 退回原因);
    if (r.result) setD(await withPendingFix(r.result));
    else { const c = await cachedDefect(id); if (c) setD(c); }
  }
  // 只有「登記」「改善」還在手機上時不能確認／編輯（那筆伺服器上還沒有或還沒到待確認）
  const blocked = d._pending === '登記' || d._pending === '改善';
  // 刪除：只限管理者、有網路、手機上沒有這筆的待上傳（沒有 ID 的舊列後端也會擋）
  const canDelete = role === '管理者' && !ro && !d._pending && !d._conflict && !String(d.缺失ID).startsWith('NOID-');
  async function del() {
    if (!navigator.onLine) return toast('刪除需要網路，請連線後再試', 'err');
    const label = `${d.棟 ? d.棟 + '棟 ' : ''}${d.戶別 || ''} ${d.窗號 || ''}`.trim();
    if (!confirm(`確定刪除這筆缺失？\n${label}${d.代碼 ? ' ' + d.代碼 : ''}\n\n會從試算表刪掉整列。原本內容會留在「操作紀錄」，需要時可以請管理者還原。`)) return;
    setDeleting(true);
    try {
      const data = { 缺失ID: d.缺失ID };
      if ('更新時間' in d) data.更新時間 = d.更新時間 ?? '';
      await call('deleteDefect', data).catch(e => { if (e.code !== 'NOT_FOUND') throw e; });
      await removeLocal(site.工地ID, d.缺失ID).catch(() => {});
      toast('已刪除', 'ok');
      go('/list');
    } catch (e) {
      if (e.code === 'CONFLICT') {
        toast('這筆剛被別人改過，請看目前內容再決定要不要刪', 'err', 4500);
        if (e.目前資料) setD(await withPendingFix(e.目前資料));
      } else toast('刪除失敗：' + errText(e), 'err', 4500);
    } finally { setDeleting(false); }
  }
  return (
    <>
      <Header title="缺失明細" backTo={-1} right={role === '管理者' && !ro && !blocked && <button class="hdr-btn txt" onClick={() => setEditing(true)}>編輯</button>} />
      <main class="page">
        <div class="dhead"><StatusPill s={d.狀態} /><b>{d.棟 ? d.棟 + '棟 ' : ''}{d.戶別} {d.窗號}</b></div>
        {d._conflict ? <p class="err small">這筆在你修改之前已被別人改過，請到 <a href="#/queue">待上傳</a> 選擇要用哪個版本。</p>
          : d._pending && <p class="warn small">這筆的{PENDING_TEXT[d._pending] || d._pending}還在手機上，有網路時會自動上傳。</p>}
        {d.離線 && !d._pending && <p class="warn small">離線中，顯示上次下載的資料{navigator.onLine ? '' : '；照片需連線才能顯示'}</p>}
        <Photos d={d} />
        <dl class="kv">{rows.map(([k, v]) => <><dt>{k}</dt><dd class={k === '退回原因' ? 'bad' : ''}>{v}</dd></>)}</dl>
        <div class="actions">
          {!ro && !blocked && d.狀態 === '未改善' && (role === '改善者' || role === '管理者') && <button class="btn primary block" onClick={() => go('/fix/' + encodeURIComponent(id))}>改善回報</button>}
          {!ro && !blocked && d.狀態 === '待確認' && role === '管理者' && <>
            <button class="btn danger" onClick={() => setRejecting(true)}>退回</button>
            <button class="btn primary" onClick={() => review('通過')}>通過</button>
          </>}
        </div>
        {canDelete && <div class="actions del-row"><button class="btn danger block" disabled={deleting} onClick={del}>{deleting ? '刪除中…' : '刪除這筆'}</button></div>}
      </main>
      {rejecting && <RejectModal onClose={() => setRejecting(false)} onSubmit={r => review('退回', r)} />}
      {editing && <EditModal d={d} onClose={() => setEditing(false)} onSaved={setD} />}
    </>
  );
}

const PENDING_TEXT = { 登記: '登記', 改善: '改善回報', 編輯: '編輯', 確認: '確認（通過）', 退回: '退回' };

// O4：確認／退回一律先存手機再送；帶上看到時的「更新時間」做衝突檢查
export async function sendReview(d, 結果, 退回原因) {
  const data = { 缺失ID: d.缺失ID, 結果, 退回原因 };
  if ('更新時間' in d) data.更新時間 = d.更新時間 ?? '';
  const r = await enqueueAndSend('review', data, `${結果} ${d.棟 ? d.棟 + '棟 ' : ''}${d.戶別 || ''} ${d.窗號 || ''}`.trim());
  const label = 結果 === '通過' ? '已結案' : '已退回';
  if (r.result !== undefined) toast(label, 'ok');
  else if (r.conflict) toast('這筆剛被別人改過，請到「待上傳」選擇要用哪個版本', 'err', 4500);
  else if (r.error) toast('無法送出：' + r.error, 'err', 4500);
  else toast(`${label}（已存到手機，有網路時會自動上傳）`, 'warn');
  return r;
}

export function RejectModal({ onClose, onSubmit }) {
  const [r, setR] = useState('');
  const quick = ['照片看不清楚，請重拍', '未改善完成', '照片位置不符'];
  return (
    <Modal title="退回原因" onClose={onClose}>
      <Chips options={quick} value={r} onChange={setR} />
      <textarea rows="3" value={r} onInput={e => setR(e.target.value)} placeholder="請寫退回原因，改善者會看到" />
      <button class="btn danger block" disabled={!r.trim()} onClick={() => onSubmit(r.trim())}>確定退回</button>
    </Modal>
  );
}

function EditModal({ d, onClose, onSaved }) {
  const [f, setF] = useState({ 棟: d.棟, 戶別: d.戶別, 窗號: d.窗號, 順序: d.順序, 長度: d.長度, 位置: d.位置, 代碼: d.代碼, 備註: d.備註 });
  const [busy, setBusy] = useState(false);
  const set = (k, v) => setF(o => ({ ...o, [k]: v }));
  async function save() {
    // 只送有改的欄位
    const changed = Object.fromEntries(Object.entries(f).filter(([k, v]) => String(v ?? '') !== String(d[k] ?? '')));
    if (!Object.keys(changed).length) { onClose(); return; }
    setBusy(true);
    try {
      const data = { 缺失ID: d.缺失ID, 欄位: changed };
      if ('更新時間' in d) data.更新時間 = d.更新時間 ?? '';
      const r = await enqueueAndSend('updateDefect', data, `編輯 ${d.棟 ? d.棟 + '棟 ' : ''}${d.戶別 || ''} ${d.窗號 || ''}`.trim());
      if (r.result) { onSaved(await withPendingFix(r.result)); toast('已更新', 'ok'); }
      else {
        const c = await cachedDefect(d.缺失ID);
        onSaved(c || { ...d, ...changed, _pending: '編輯' });
        if (r.conflict) toast('這筆剛被別人改過，請到「待上傳」選擇要用哪個版本', 'err', 4500);
        else if (r.error) toast('無法送出：' + r.error, 'err', 4500);
        else toast('已存到手機，有網路時會自動上傳', 'warn');
      }
      onClose();
    } catch (e) { toast(errText(e), 'err'); } finally { setBusy(false); }
  }
  return (
    <Modal title="編輯缺失" onClose={onClose} full>
      <div class="form">
        {['棟', '戶別', '窗號', '順序', '長度'].map(k => <label class="fld"><span>{k}</span><input value={f[k]} onInput={e => set(k, e.target.value)} /></label>)}
        <label class="fld"><span>代碼</span><CodePicker value={f.代碼} onChange={v => set('代碼', v)} /></label>
        <label class="fld"><span>位置</span><Chips options={POSITIONS} value={f.位置} onChange={v => set('位置', v)} allowEmpty /></label>
        <label class="fld"><span>備註</span><textarea rows="3" value={f.備註} onInput={e => set('備註', e.target.value)} /></label>
        <button class="btn primary block" disabled={busy} onClick={save}>{busy ? '儲存中…' : '儲存'}</button>
      </div>
    </Modal>
  );
}

export function Fix({ id }) {
  const { site } = useStore();
  const { d, err } = useDefect(id);
  const gps = useGps(site);
  const [photo, setPhoto] = useState(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const gpsBlock = gps.range.need && !gps.range.ok;
  async function submit() {
    if (!photo) return toast('請拍改善後照片', 'err');
    setBusy(true);
    try {
      await enqueue('submitFix', { 缺失ID: id, 改善後照片: photo.base64, GPS: gps.pos, 備註: note.trim() || undefined, 改善日期: today() }, `改善 ${d?.戶別 || ''} ${d?.窗號 || ''}`);
      const r = await flush();
      toast(r.stopped ? '已存到手機，有網路時會自動上傳' : '已送出，等待管理者確認', r.stopped ? 'warn' : 'ok');
      history.back();
    } catch (e) { toast(e.message, 'err'); } finally { setBusy(false); }
  }
  return (
    <>
      <Header title="改善回報" backTo={-1} />
      <main class="page form">
        {err && <p class="err">{err}</p>}
        {d && <>
          <div class="dhead"><b>{d.棟 ? d.棟 + '棟 ' : ''}{d.戶別} {d.窗號}</b> {d.代碼} {d.代碼內容 || codeText(d.代碼)}</div>
          {d.退回原因 && <p class="warn">上次退回：{d.退回原因}</p>}
          <figure class="ref"><Thumb url={d.改善前照片網址 || d.改善前縮圖網址} fileId={d.改善前照片ID} cls="pimg" /><figcaption>改善前</figcaption></figure>
        </>}
        {!d && !err && <Spinner />}
        <PhotoInput label="改善後照片" value={photo} onChange={setPhoto} />
        <GpsLine gps={gps} site={site} />
        <label class="fld"><span>備註（選填）</span><textarea rows="2" value={note} onInput={e => setNote(e.target.value)} /></label>
        <div class="actions sticky"><button class="btn primary block" disabled={busy || gpsBlock || !photo} onClick={submit}>{busy ? '送出中…' : '送出改善'}</button></div>
      </main>
    </>
  );
}
