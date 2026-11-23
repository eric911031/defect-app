import { useState } from 'preact/hooks';
import { useStore, toast } from '../store.js';
import { Header } from '../components.jsx';
import { call, errText } from '../api.js';
import { STATUS } from '../config.js';
import { toList } from '../util.js';

export function Report() {
  const { site } = useStore();
  const [sts, setSts] = useState(['已結案']);
  const [bld, setBld] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const blds = toList(site.棟別清單);
  const toggle = s => setSts(l => l.includes(s) ? l.filter(x => x !== s) : [...l, s]);
  async function gen() {
    if (!sts.length) return toast('請至少選一個狀態', 'err');
    setBusy(true); setResult(null);
    try { setResult(await call('generateReport', { 工地ID: site.工地ID, 狀態: sts, 棟: bld || undefined, 起日: from || undefined, 迄日: to || undefined })); }
    catch (e) { toast(errText(e), 'err'); } finally { setBusy(false); }
  }
  return (
    <>
      <Header title="產生 PDF 報告" backTo="/more" />
      <main class="page form">
        <p class="muted">{site.名稱}：改善前後照片對照，每筆一頁。資料多時需要 1–2 分鐘。</p>
        <div class="fld"><span>狀態</span><div class="chips">{STATUS.map(s => <button type="button" class={'chip' + (sts.includes(s) ? ' on' : '')} onClick={() => toggle(s)}>{s}</button>)}</div></div>
        {blds.length > 0 && <label class="fld"><span>棟</span><select value={bld} onChange={e => setBld(e.target.value)}><option value="">全部</option>{blds.map(b => <option>{b}</option>)}</select></label>}
        <div class="row2">
          <label class="fld"><span>改善日期起</span><input type="date" value={from} onInput={e => setFrom(e.target.value)} /></label>
          <label class="fld"><span>迄</span><input type="date" value={to} onInput={e => setTo(e.target.value)} /></label>
        </div>
        <button class="btn primary block" disabled={busy} onClick={gen}>{busy ? '產生中，請稍候…' : '產生報告'}</button>
        {result && <div class="card ok-box"><p>報告已產生並存到 Drive。</p><a class="btn block" href={result.url} target="_blank" rel="noopener">開啟 PDF</a></div>}
      </main>
    </>
  );
}
