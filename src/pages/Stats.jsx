import { useEffect, useState } from 'preact/hooks';
import { useStore } from '../store.js';
import { Header, Spinner } from '../components.jsx';
import { call, errText } from '../api.js';
import { STATUS } from '../config.js';

// 狀態顏色（狀態色固定，永遠搭配圖示與文字）
const COLOR = { 未改善: 'var(--st-todo)', 待確認: 'var(--st-wait)', 已結案: 'var(--st-done)' };
const ICON = { 未改善: '!', 待確認: '?', 已結案: '✓' };

function Donut({ counts, total }) {
  const R = 60, C = 2 * Math.PI * R, GAP = total > 0 ? 2 : 0;
  let off = 0;
  const [hover, setHover] = useState(null);
  return (
    <div class="donut">
      <svg viewBox="0 0 160 160" role="img" aria-label="各狀態數量">
        <circle cx="80" cy="80" r={R} fill="none" stroke="var(--line)" stroke-width="22" />
        {STATUS.map(s => {
          const len = total ? (counts[s] / total) * C : 0;
          const seg = <circle cx="80" cy="80" r={R} fill="none" stroke={COLOR[s]} stroke-width={hover === s ? 26 : 22}
            stroke-dasharray={`${Math.max(0, len - GAP)} ${C}`} stroke-dashoffset={-off} transform="rotate(-90 80 80)"
            onMouseEnter={() => setHover(s)} onMouseLeave={() => setHover(null)} onClick={() => setHover(h => h === s ? null : s)} style="cursor:pointer" />;
          off += len;
          return len > 0 ? seg : null;
        })}
        <text x="80" y="76" text-anchor="middle" class="d-num">{hover ? counts[hover] : total}</text>
        <text x="80" y="98" text-anchor="middle" class="d-lbl">{hover || '總筆數'}</text>
      </svg>
      <ul class="legend">
        {STATUS.map(s => (
          <li onMouseEnter={() => setHover(s)} onMouseLeave={() => setHover(null)}>
            <i style={{ background: COLOR[s] }} />{ICON[s]} {s}
            <b>{counts[s] || 0}</b><small>{total ? Math.round(((counts[s] || 0) / total) * 100) : 0}%</small>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function Stats() {
  const { site } = useStore();
  const [scope, setScope] = useState('site');
  const [data, setData] = useState(null);
  const [err, setErr] = useState('');
  const [table, setTable] = useState(false);
  useEffect(() => {
    setData(null); setErr('');
    call('stats', scope === 'site' ? { 工地ID: site.工地ID } : {}).then(setData).catch(e => setErr(errText(e)));
  }, [site.工地ID, scope]);
  const counts = data?.狀態 || {};
  const total = STATUS.reduce((a, s) => a + (counts[s] || 0), 0);
  const rank = (data?.代碼排名 || []).slice(0, 15);
  const max = Math.max(1, ...rank.map(r => r.數量));
  const blds = data?.各棟 || [];
  return (
    <>
      <Header title="統計" right={<button class="hdr-btn txt" onClick={() => setTable(!table)}>{table ? '圖表' : '表格'}</button>} />
      <main class="page">
        <div class="chips">
          <button class={'chip' + (scope === 'site' ? ' on' : '')} onClick={() => setScope('site')}>{site.名稱}</button>
          <button class={'chip' + (scope === 'all' ? ' on' : '')} onClick={() => setScope('all')}>全部工地</button>
        </div>
        {err && <p class="err">{err}</p>}
        {!data && !err && <Spinner />}
        {data && <>
          <section class="card"><h3>改善狀態</h3>
            {table ? <table class="tbl"><tr><th>狀態</th><th>筆數</th></tr>{STATUS.map(s => <tr><td>{s}</td><td>{counts[s] || 0}</td></tr>)}</table>
              : <Donut counts={counts} total={total} />}
          </section>
          {blds.length > 0 && <section class="card"><h3>各棟進度</h3>
            {table ? <table class="tbl"><tr><th>棟</th>{STATUS.map(s => <th>{s}</th>)}</tr>{blds.map(b => <tr><td>{b.棟}</td>{STATUS.map(s => <td>{b[s] || 0}</td>)}</tr>)}</table> :
              <div class="stack-list">
                {blds.map(b => {
                  const t = STATUS.reduce((a, s) => a + (b[s] || 0), 0) || 1;
                  return (
                    <div class="stack-row">
                      <span class="sl">{b.棟}</span>
                      <div class="stack">{STATUS.map(s => b[s] ? <span title={`${b.棟} ${s}：${b[s]}`} style={{ width: `${(b[s] / t) * 100}%`, background: COLOR[s] }} /> : null)}</div>
                      <span class="sv">{Math.round(((b.已結案 || 0) / t) * 100)}% 結案</span>
                    </div>
                  );
                })}
                <ul class="legend inline">{STATUS.map(s => <li><i style={{ background: COLOR[s] }} />{ICON[s]} {s}</li>)}</ul>
              </div>}
          </section>}
          <section class="card"><h3>缺失代碼排名（前 15）</h3>
            {table ? <table class="tbl"><tr><th>代碼</th><th>內容</th><th>數量</th></tr>{rank.map(r => <tr><td>{r.代碼}</td><td>{r.內容}</td><td>{r.數量}</td></tr>)}</table> :
              <div class="bars">
                {rank.map(r => (
                  <div class="bar-row" title={`${r.代碼} ${r.內容}：${r.數量} 筆`}>
                    <span class="bl"><b>{r.代碼}</b> {r.內容}</span>
                    <span class="bt"><span class="bf" style={{ width: `${(r.數量 / max) * 100}%` }} /></span>
                    <span class="bv">{r.數量}</span>
                  </div>
                ))}
              </div>}
          </section>
        </>}
      </main>
    </>
  );
}
