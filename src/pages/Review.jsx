import { useEffect, useState } from 'preact/hooks';
import { useStore, toast } from '../store.js';
import { Header, Spinner, Empty } from '../components.jsx';
import { call, errText } from '../api.js';
import { loadDefects, cachedDefects, codeText } from '../data.js';
import { Photos, RejectModal } from './Detail.jsx';

// 待確認：改善前後照片並排，逐筆通過或退回
export function Review() {
  const { site } = useStore();
  const [items, setItems] = useState(null);
  const [err, setErr] = useState('');
  useEffect(() => {
    setItems(null);
    let fresh = false;
    cachedDefects(site.工地ID, '待確認').then(c => { if (c && !fresh) setItems(c.items); });
    loadDefects(site.工地ID, '待確認').then(r => { fresh = true; setItems(r.items); }).catch(e => setErr(errText(e)));
  }, [site.工地ID]);
  const done = id => setItems(l => l.filter(x => x.缺失ID !== id));
  return (
    <>
      <Header title={`待確認${items ? `（${items.length}）` : ''}`} />
      <main class="page">
        {err && <p class="err">{err}</p>}
        {!items && !err && <Spinner />}
        {items && items.length === 0 && <Empty>目前沒有待確認的改善 🎉</Empty>}
        {items && items.map(d => <ReviewCard key={d.缺失ID} item={d} onDone={done} />)}
      </main>
    </>
  );
}

function ReviewCard({ item, onDone }) {
  const [d, setD] = useState(item);
  const [busy, setBusy] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  useEffect(() => { if (!item.改善後照片網址 && !item._pending && navigator.onLine) call('getDefect', { 缺失ID: item.缺失ID }).then(x => setD(o => ({ ...o, ...x }))).catch(() => {}); }, [item.缺失ID]);
  async function act(結果, 退回原因) {
    setBusy(true);
    try { await call('review', { 缺失ID: d.缺失ID, 結果, 退回原因 }); toast(結果 === '通過' ? '已結案' : '已退回', 'ok'); onDone(d.缺失ID); }
    catch (e) { toast(errText(e), 'err'); setBusy(false); }
  }
  return (
    <article class="card rv">
      <div class="rv-hdr"><b>{d.棟 ? d.棟 + '棟 ' : ''}{d.戶別} {d.窗號}</b><small>{d.代碼} {d.代碼內容 || codeText(d.代碼)}</small></div>
      <Photos d={d} />
      <p class="muted small">改善：{d.改善日期} {d.改善人}{d.備註 ? `・${d.備註}` : ''}</p>
      {d._pending ? <p class="warn small">改善回報還在改善者手機上，上傳後才能確認。</p> : <div class="actions">
        <button class="btn danger" disabled={busy} onClick={() => setRejecting(true)}>退回</button>
        <button class="btn primary" disabled={busy} onClick={() => act('通過')}>通過</button>
      </div>}
      {rejecting && <RejectModal onClose={() => setRejecting(false)} onSubmit={r => { setRejecting(false); act('退回', r); }} />}
    </article>
  );
}
