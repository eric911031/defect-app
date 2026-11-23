import { useEffect, useMemo, useState } from 'preact/hooks';
import { useStore } from '../store.js';
import { Header, Spinner, StatusPill, Chips, Empty, Thumb } from '../components.jsx';
import { loadDefects, codeText } from '../data.js';
import { onSent } from '../queue.js';
import { go } from '../router.js';
import { STATUS } from '../config.js';
import { errText } from '../api.js';

function unitSort(a, b) {
  const n = s => { const m = String(s).match(/^(B?)(\d+)/); return m ? (m[1] ? -1 : 1) * +m[2] : 999; };
  return n(a) - n(b) || String(a).localeCompare(String(b));
}

export function List() {
  const { site, user } = useStore();
  const fixer = user.角色 === '改善者';
  const [status, setStatus] = useState(() => sessionStorage.getItem('listStatus') || '未改善');
  const [bld, setBld] = useState('');
  const [q, setQ] = useState('');
  const [res, setRes] = useState(null);
  const [err, setErr] = useState('');
  const [open, setOpen] = useState({});
  const [tick, setTick] = useState(0);
  const st = fixer ? '未改善' : status;

  useEffect(() => onSent(() => setTick(t => t + 1)), []);
  useEffect(() => {
    let live = true;
    setErr(''); if (!res) setRes(null);
    loadDefects(site.工地ID, st === '全部' ? '' : st).then(r => live && setRes(r)).catch(e => live && setErr(errText(e)));
    return () => { live = false; };
  }, [site.工地ID, st, tick]);

  const items = res?.items || [];
  const blds = useMemo(() => [...new Set(items.map(d => d.棟).filter(Boolean))].sort(), [items]);
  const groups = useMemo(() => {
    const k = q.trim().toUpperCase();
    const filtered = items.filter(d => (!bld || d.棟 === bld) && (!k || `${d.戶別} ${d.窗號} ${d.代碼} ${d.代碼內容 || codeText(d.代碼)} ${d.備註}`.toUpperCase().includes(k)));
    const m = new Map();
    for (const d of filtered) {
      const key = `${d.棟 ? d.棟 + '棟 ' : ''}${d.戶別 || '（未填戶別）'}`;
      if (!m.has(key)) m.set(key, { key, 棟: d.棟 || '', 戶別: d.戶別 || '', list: [] });
      m.get(key).list.push(d);
    }
    const arr = [...m.values()].sort((a, b) => a.棟.localeCompare(b.棟) || unitSort(a.戶別, b.戶別));
    arr.forEach(g => g.list.sort((a, b) => String(a.窗號).localeCompare(String(b.窗號), 'zh', { numeric: true }) || (+a.順序 || 0) - (+b.順序 || 0)));
    return { arr, count: filtered.length };
  }, [items, bld, q]);
  const many = groups.arr.length > 12 && !q;

  return (
    <>
      <Header title={fixer ? '待改善' : '缺失清單'} />
      <main class="page">
        {!fixer && <Chips options={[...STATUS, '全部']} value={status} onChange={v => { setStatus(v); sessionStorage.setItem('listStatus', v); }} />}
        <div class="filters">
          <input type="search" placeholder="搜尋戶別、窗號、代碼、備註" value={q} onInput={e => setQ(e.target.value)} />
          {blds.length > 1 && <select value={bld} onChange={e => setBld(e.target.value)}><option value="">全部棟</option>{blds.map(b => <option value={b}>{b}棟</option>)}</select>}
        </div>
        {res?.fromCache && <p class="warn small">離線中，顯示上次下載的資料</p>}
        {err && <p class="err">{err}</p>}
        {!res && !err && <Spinner />}
        {res && <p class="muted small">{groups.arr.length} 戶・{groups.count} 筆</p>}
        {res && groups.count === 0 && <Empty>沒有符合的缺失</Empty>}
        {groups.arr.map(g => {
          const isOpen = !many || open[g.key];
          return (
            <section class="grp">
              <button class="grp-hdr" onClick={() => setOpen(o => ({ ...o, [g.key]: !isOpen }))}>
                <b>{g.key}</b><span class="cnt">{g.list.length}</span><span class="caret">{isOpen ? '▾' : '▸'}</span>
              </button>
              {isOpen && <ul class="list">{g.list.map(d => <DefectRow d={d} />)}</ul>}
            </section>
          );
        })}
      </main>
    </>
  );
}

export function DefectRow({ d }) {
  const text = d.代碼內容 || codeText(d.代碼);
  return (
    <li>
      <button class="row defect" onClick={() => go('/defect/' + encodeURIComponent(d.缺失ID))}>
        <Thumb url={d.改善前縮圖網址} fileId={d.改善前照片ID} />
        <span class="dinfo">
          <span class="l1"><b>{d.窗號 || '—'}</b>{d.順序 ? <small> #{d.順序}</small> : null} {d.代碼 && <b class="code">{d.代碼}</b>} {text || (!d.代碼 && d.備註)}</span>
          {d.備註 && (d.代碼 || text) && <span class="l2">{d.備註}</span>}
          {d.退回原因 && d.狀態 === '未改善' && <span class="l2 bad">退回：{d.退回原因}</span>}
        </span>
        <StatusPill s={d.狀態} />
      </button>
    </li>
  );
}
