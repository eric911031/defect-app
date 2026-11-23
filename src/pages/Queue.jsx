import { useEffect, useState } from 'preact/hooks';
import { useStore, toast } from '../store.js';
import { Header, Empty } from '../components.jsx';
import { listItems, flush, removeItem } from '../queue.js';
import { fmtTime } from '../util.js';

export function Queue() {
  const { pending, syncing, online } = useStore();
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
  return (
    <>
      <Header title="待上傳" backTo={-1} />
      <main class="page">
        <p class="muted small">{online ? '有網路時會自動上傳。' : '目前離線，恢復網路後會自動上傳。'}資料存在這支手機上，請勿刪除 App 或清除 Safari 資料。</p>
        {items.length === 0 ? <Empty>沒有待上傳的資料</Empty> : (
          <>
            <ul class="list">
              {items.map(it => (
                <li class="row q">
                  {it.data.改善前照片 || it.data.改善後照片 ? <img class="thumb" src={'data:image/jpeg;base64,' + (it.data.改善前照片 || it.data.改善後照片)} alt="" /> : null}
                  <span class="dinfo">
                    <b>{it.action === 'createDefect' ? '登記' : '改善'}：{it.summary}</b>
                    <small>{fmtTime(it.createdAt)}{it.tries ? `・已試 ${it.tries} 次` : ''}</small>
                    {it.error && <small class={it.retryable ? 'muted' : 'bad'}>{it.retryable ? '等待重送：' : '無法上傳：'}{it.error}</small>}
                  </span>
                  <button class="link bad" onClick={() => del(it)}>刪除</button>
                </li>
              ))}
            </ul>
            <button class="btn primary block" disabled={syncing} onClick={retry}>{syncing ? '上傳中…' : '立即上傳'}</button>
          </>
        )}
      </main>
    </>
  );
}
