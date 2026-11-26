import { useEffect, useMemo, useState } from 'preact/hooks';
import { useStore } from '../store.js';
import { Header, Spinner, StatusPill, Chips, Empty, Thumb } from '../components.jsx';
import { loadDefects, cachedDefects, codeText } from '../data.js';
import { onSent } from '../queue.js';
import { go } from '../router.js';
import { STATUS } from '../config.js';
import { isReadOnly, parseUnit } from '../util.js';
import { errText } from '../api.js';

const natural = (a, b) => String(a).localeCompare(String(b), 'zh', { numeric: true });

export function List() {
  const { site, user } = useStore();
  const fixer = user.角色 === '改善者';
  const [status, setStatus] = useState(() => sessionStorage.getItem('listStatus') || '未改善');
  const [bld, setBld] = useState('');
  const [floorF, setFloorF] = useState('');
  const [q, setQ] = useState('');
  const [res, setRes] = useState(null);
  const [err, setErr] = useState('');
  const [open, setOpen] = useState({});
  const [tick, setTick] = useState(0);
  const ro = isReadOnly(site);
  // 舊建案全部已結案，預設看全部
  const st = fixer ? '未改善' : ro && status === '未改善' ? '全部' : status;

  useEffect(() => onSent(() => setTick(t => t + 1)), []);
  useEffect(() => {
    let live = true;
    const s2 = st === '全部' ? '' : st;
    setErr('');
    let gotFresh = false;
    cachedDefects(site.工地ID, s2).then(c => { if (live && c && !gotFresh) setRes({ items: c.items, fromCache: true, refreshing: true }); });
    loadDefects(site.工地ID, s2).then(r => { gotFresh = true; live && setRes(r); }).catch(e => live && setErr(errText(e)));
    return () => { live = false; };
  }, [site.工地ID, st, tick]);

  const items = res?.items || [];
  const blds = useMemo(() => [...new Set(items.map(d => d.棟).filter(Boolean))].sort(), [items]);
  // 依「棟 › 樓層 › 戶別」分組；樓層由戶別自動解析（2A1 → 2F）
  const parsed = useMemo(() => items.map(d => ({ d, p: parseUnit(d.戶別) })), [items]);
  const floorOpts = useMemo(() => {
    const m = new Map();
    for (const { p } of parsed) m.set(p.label, p.floor);
    return [...m.entries()].sort((a, b) => (a[1] ?? 1e9) - (b[1] ?? 1e9)).map(e => e[0]);
  }, [parsed]);
  const groups = useMemo(() => {
    const k = q.trim().toUpperCase();
    const filtered = parsed.filter(({ d, p }) => (!bld || d.棟 === bld) && (!floorF || p.label === floorF) &&
      (!k || `${d.戶別} ${d.窗號} ${d.代碼} ${d.代碼內容 || codeText(d.代碼)} ${d.備註}`.toUpperCase().includes(k)));
    const floorsM = new Map();
    for (const { d, p } of filtered) {
      const fkey = `${d.棟 || ''}|${p.label}`;
      if (!floorsM.has(fkey)) floorsM.set(fkey, { key: fkey, title: `${d.棟 ? d.棟 + '棟 ' : ''}${p.label}`, 棟: d.棟 || '', floor: p.floor, units: new Map(), count: 0 });
      const f = floorsM.get(fkey);
      // 同一戶不同寫法（10F-A3、10F - A3、10A3）合併；有樓層時只顯示戶號
      const name = p.floor != null ? (p.unit || '（整層）') : (d.戶別 || '（未填戶別）');
      if (!f.units.has(name)) f.units.set(name, { name, list: [] });
      const ukey = name;
      f.units.get(ukey).list.push(d);
      f.count++;
    }
    const arr = [...floorsM.values()].sort((a, b) => a.棟.localeCompare(b.棟) || (a.floor ?? 1e9) - (b.floor ?? 1e9));
    for (const f of arr) {
      f.units = [...f.units.values()].sort((a, b) => natural(a.name, b.name));
      f.units.forEach(u => u.list.sort((a, b) => natural(a.窗號, b.窗號) || (+a.順序 || 0) - (+b.順序 || 0)));
    }
    const unitCount = arr.reduce((n, f) => n + f.units.length, 0);
    return { arr, count: filtered.length, unitCount };
  }, [parsed, bld, floorF, q]);
  const many = groups.arr.length > 6 && !q && !floorF;

  return (
    <>
      <Header title={fixer ? '待改善' : '缺失清單'} />
      <main class="page">
        {!fixer && <Chips options={[...STATUS, '全部']} value={st} onChange={v => { setStatus(v); sessionStorage.setItem('listStatus', v); }} />}
        <div class="filters">
          <input type="search" placeholder="搜尋戶別、窗號、代碼、備註" value={q} onInput={e => setQ(e.target.value)} />
          {blds.length > 1 && <select value={bld} onChange={e => setBld(e.target.value)}><option value="">全部棟</option>{blds.map(b => <option value={b}>{b}棟</option>)}</select>}
          {floorOpts.length > 1 && <select value={floorF} onChange={e => setFloorF(e.target.value)}><option value="">全部樓層</option>{floorOpts.map(f => <option value={f}>{f}</option>)}</select>}
        </div>
        {res?.refreshing ? <p class="muted small">更新中…</p> : res?.fromCache && <p class="warn small">離線中，顯示上次下載的資料</p>}
        {err && <p class="err">{err}</p>}
        {!res && !err && <Spinner />}
        {res && <p class="muted small">{groups.arr.length} 個樓層・{groups.unitCount} 戶・{groups.count} 筆{many ? '・點樓層展開' : ''}</p>}
        {res && groups.count === 0 && <Empty>沒有符合的缺失</Empty>}
        {groups.arr.map(f => {
          const isOpen = !many || open[f.key];
          return (
            <section class="grp">
              <button class="grp-hdr floor" onClick={() => setOpen(o => ({ ...o, [f.key]: !isOpen }))}>
                <b>{f.title}</b><small class="muted">{f.units.length} 戶</small><span class="cnt">{f.count}</span><span class="caret">{isOpen ? '▾' : '▸'}</span>
              </button>
              {isOpen && f.units.map(u => (
                <div class="unit">
                  <div class="unit-hdr"><b>{u.name}</b><span class="muted small">{u.list.length} 筆</span></div>
                  <ul class="list">{u.list.map(d => <DefectRow d={d} />)}</ul>
                </div>
              ))}
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
