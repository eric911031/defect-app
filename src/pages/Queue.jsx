import { useEffect, useState } from 'preact/hooks';
import { useStore, toast } from '../store.js';
import { Header, Empty } from '../components.jsx';
import { listItems, flush, removeItem, resolveConflict, canOverwrite, isMine } from '../queue.js';
import { fmtTime } from '../util.js';

const ACTION = { createDefect: '登記', submitFix: '改善', review: '確認', updateDefect: '編輯' };

export function Queue() {
  const { pending, syncing, online, user } = useStore();
  const [items, setItems] = useState([]);
  const reload = () => listItems().then(setItems);
  useEffect(() => { reload(); }, [pending, syncing]);
  async function retry() {
    const r = await flush({ includeFailed: true });
    toast(r.sent ? `已上傳 ${r.sent} 筆` : r.stopped ? '目前無法連線，稍後會自動重試' : '沒有可上傳的資料', r.sent ? 'ok' : 'warn');
    reload();
  }
  async function del(it) {
    if (!confirm(`確定刪除這筆待上傳資料？\n${it.summary || ''}\n刪除後無法復原（照片也會刪除）。`)) return;
    await removeItem(it.id); reload();
  }
  const conflicts = items.filter(i => i.conflict && isMine(i, user?.Email));
  const rest = items.filter(i => !conflicts.includes(i));
  return (
    <>
      <Header title="待上傳" backTo={-1} />
      <main class="page">
        <p class="muted small">{online ? '有網路時會自動上傳。' : '目前離線，恢復網路後會自動上傳。'}資料存在這支手機上，請勿刪除 App 或清除 Safari 資料。</p>
        {conflicts.length > 0 && <>
          <h3 class="sec-title bad">需要你決定（{conflicts.length}）</h3>
          {conflicts.map(it => <ConflictCard key={it.id} it={it} onDone={reload} />)}
        </>}
        {items.length === 0 ? <Empty>沒有待上傳的資料</Empty> : rest.length > 0 && (
          <>
            <ul class="list">
              {rest.map(it => {
                const foreign = !isMine(it, user?.Email);
                return (
                  <li class="row q">
                    {it.data.改善前照片 || it.data.改善後照片 ? <img class="thumb" src={'data:image/jpeg;base64,' + (it.data.改善前照片 || it.data.改善後照片)} alt="" /> : null}
                    <span class="dinfo">
                      <b>{ACTION[it.action] || it.action}：{it.summary}</b>
                      <small>{fmtTime(it.createdAt)}{it.tries ? `・已試 ${it.tries} 次` : ''}</small>
                      {foreign ? <small class="bad">這是 {it.email} 留下的資料，要用該帳號登入才能上傳。</small>
                        : it.error && <small class={it.retryable ? 'muted' : 'bad'}>{it.retryable ? '等待重送：' : '無法上傳：'}{it.error}</small>}
                    </span>
                    <button class="link bad" onClick={() => del(it)}>刪除</button>
                  </li>
                );
              })}
            </ul>
            <button class="btn primary block" disabled={syncing} onClick={retry}>{syncing ? '上傳中…' : '立即上傳'}</button>
          </>
        )}
      </main>
    </>
  );
}

// O5：衝突時並列「你的版本／目前版本」
const show = v => (v === '' || v == null ? '—' : String(v));
function compareRows(it) {
  const cur = it.conflict.current || {};
  const d = it.data;
  if (it.action === 'updateDefect') return Object.keys(d.欄位 || {}).map(k => [k, d.欄位[k], cur[k]]);
  if (it.action === 'review') return [
    ['狀態', d.結果 === '通過' ? '已結案（通過）' : '未改善（退回）', cur.狀態],
    ['退回原因', d.結果 === '退回' ? d.退回原因 : '', cur.退回原因],
    ['確認人', '你', cur.確認人]
  ];
  if (it.action === 'submitFix') return [['狀態', '待確認（你的改善）', cur.狀態], ['改善人', '你', cur.改善人]];
  return [];
}
function ConflictCard({ it, onDone }) {
  const [busy, setBusy] = useState(false);
  const cur = it.conflict.current;
  const can = canOverwrite(it);
  async function pick(choice) {
    if (choice === 'mine' && !confirm('用你的版本覆蓋目前的資料？')) return;
    if (choice === 'theirs' && !confirm('放棄你的修改，改用目前的資料？（無法復原）')) return;
    setBusy(true);
    try {
      const r = await resolveConflict(it.id, choice);
      toast(choice === 'mine' ? (r?.sent ? '已用你的版本送出' : '已排入上傳') : '已放棄你的修改', 'ok');
    } finally { setBusy(false); onDone(); }
  }
  const why = !cur ? '你看不到這筆目前的資料（可能已被移出你的權限）。'
    : it.action === 'submitFix' ? (cur.狀態 === '已結案' ? '這筆已經結案，改善回報只能放棄。' : '這筆已經有人回報改善，你的回報只能放棄。')
    : it.action === 'review' && cur.狀態 !== '待確認' ? `這筆目前是「${cur.狀態}」，已經不能再確認或退回。` : '';
  return (
    <article class="card conflict">
      <div class="rv-hdr"><b>{ACTION[it.action] || it.action}：{it.summary}</b><small>{fmtTime(it.createdAt)}</small></div>
      <p class="small">你在手機上修改之後，這筆已被別人改過{cur?.更新時間 ? `（${cur.更新時間}）` : ''}。</p>
      {cur && <table class="cmp">
        <thead><tr><th></th><th>你的版本</th><th>目前版本</th></tr></thead>
        <tbody>{compareRows(it).map(([k, a, b]) => <tr class={show(a) !== show(b) ? 'diff' : ''}><th>{k}</th><td>{show(a)}</td><td>{show(b)}</td></tr>)}</tbody>
      </table>}
      {why && <p class="warn small">{why}</p>}
      <div class="actions">
        <button class="btn" disabled={busy} onClick={() => pick('theirs')}>放棄我的</button>
        {can && <button class="btn primary" disabled={busy} onClick={() => pick('mine')}>用我的覆蓋</button>}
      </div>
    </article>
  );
}
