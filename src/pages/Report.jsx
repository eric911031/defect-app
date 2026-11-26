import { useEffect, useRef, useState } from 'preact/hooks';
import { useStore, toast } from '../store.js';
import { Header } from '../components.jsx';
import { call, errText } from '../api.js';
import { STATUS } from '../config.js';
import { toList } from '../util.js';

// 大量報告：後端每次產生一份 PDF，前端重複呼叫 reportContinue 直到完成。
// 進行中的報告ID 存在 localStorage，離開頁面後回來可以繼續。
const KEY = siteId => 'report:' + siteId;
const wait = ms => new Promise(r => setTimeout(r, ms));
function saveJob(siteId, job) { try { job ? localStorage.setItem(KEY(siteId), JSON.stringify(job)) : localStorage.removeItem(KEY(siteId)); } catch {} }
function loadJob(siteId) { try { return JSON.parse(localStorage.getItem(KEY(siteId)) || 'null'); } catch { return null; } }

export function Report() {
  const { site } = useStore();
  const [sts, setSts] = useState(['已結案']);
  const [bld, setBld] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [running, setRunning] = useState(false);
  const [prog, setProg] = useState(null);       // 報告進度
  const [pending, setPending] = useState(() => loadJob(site.工地ID)); // 上次沒做完的
  const [note, setNote] = useState('');
  const stopRef = useRef(false);
  const blds = toList(site.棟別清單);
  const toggle = s => setSts(l => l.includes(s) ? l.filter(x => x !== s) : [...l, s]);

  useEffect(() => () => { stopRef.current = true; }, []);

  // 回到報告頁：用 reportStatus 查上次的報告（後端 2.2）；背景產生中就自動繼續看進度
  useEffect(() => {
    if (!pending) return;
    call('reportStatus', { 報告ID: pending.報告ID }).then(p => {
      setProg(p);
      if (p.完成) { saveJob(site.工地ID, { ...pending, 完成: true }); setPending(null); }
      else if (p.背景) resume(p);
    }).catch(e => {
      if (e.code === 'NOT_FOUND') { saveJob(site.工地ID, null); setPending(null); }
      // 2.1 後端沒有 reportStatus：保留「繼續產生」按鈕
    });
  }, []);

  // 後端 2.2：背景:true 時伺服器自己做，前端每 15 秒用 reportStatus 查進度；
  // 背景:false（或 2.1）時由前端呼叫 reportContinue 一份一份推進。
  async function runLoop(first) {
    // 舊版後端（2.0）沒有「完成」欄位，視為一次完成
    const norm = x => x && x.完成 === undefined ? { ...x, 完成: true, 總份數: 1, 已完成份數: 1 } : x;
    let p = norm(first), fails = 0;
    setProg(p);
    while (p && !p.完成 && !stopRef.current) {
      try {
        if (p.背景) {
          setNote('伺服器正在背景產生，可以關掉 App，稍後回到報告頁查看。');
          await wait(15000);
          if (stopRef.current) break;
          p = norm(await call('reportStatus', { 報告ID: p.報告ID }));
        } else {
          if (p.處理中) { setNote('伺服器正在產生中，稍候…'); await wait(5000); }
          setNote(`正在產生第 ${(p.已完成份數 || 0) + 1} 份（每份約 1 分鐘，請保持這個畫面開著）`);
          p = norm(await call('reportContinue', { 報告ID: p.報告ID }));
        }
        fails = 0;
        setProg(p);
        saveJob(site.工地ID, { 報告ID: p.報告ID, 總份數: p.總份數, 已完成份數: p.已完成份數, 完成: !!p.完成, at: Date.now() });
      } catch (e) {
        if (e.code === 'NOT_FOUND') { saveJob(site.工地ID, null); throw e; }
        if (!(e.network || e.code === 'BUSY') || ++fails > 5) throw e;
        setNote(`連線中斷，${fails * 5} 秒後重試（第 ${fails} 次）…`);
        await wait(fails * 5000);
      }
    }
    setNote(p?.背景 && !p.完成 ? '伺服器會繼續在背景產生，回到這頁就能看到進度。' : '');
    if (p?.完成) { setPending(null); toast('報告已產生', 'ok'); }
  }

  async function gen() {
    if (!sts.length) return toast('請至少選一個狀態', 'err');
    stopRef.current = false;
    setRunning(true); setProg(null); setNote('準備資料中…');
    try {
      const p = await call('generateReport', { 工地ID: site.工地ID, 狀態: sts, 棟: bld || undefined, 起日: from || undefined, 迄日: to || undefined });
      if (p.完成 === false) saveJob(site.工地ID, { 報告ID: p.報告ID, 總份數: p.總份數, 已完成份數: p.已完成份數, at: Date.now() });
      await runLoop(p);
    } catch (e) { toast(errText(e), 'err'); setNote(''); }
    finally { setRunning(false); const j = loadJob(site.工地ID); setPending(j && !j.完成 ? j : null); }
  }

  async function resume(from) {
    stopRef.current = false;
    setRunning(true);
    try { await runLoop(from || { 報告ID: pending.報告ID, 完成: false, 總份數: pending.總份數, 已完成份數: pending.已完成份數 }); }
    catch (e) { toast(e.code === 'NOT_FOUND' ? '這份報告的進度已過期（超過 7 天），請重新產生' : errText(e), 'err'); setNote(''); }
    finally { setRunning(false); const j = loadJob(site.工地ID); setPending(j && !j.完成 ? j : null); }
  }

  const parts = prog?.部分 || [];
  const total = prog?.總份數 || 0, done = prog?.已完成份數 || 0;
  return (
    <>
      <Header title="產生 PDF 報告" backTo="/more" />
      <main class="page form">
        <p class="muted">{site.名稱}：改善前後照片對照，每筆一頁。資料多時會自動分成多份 PDF。</p>
        {pending && !running && !prog?.完成 && !pending.完成 && (
          <div class="card warn-box">
            <p>上次的報告還沒產生完（已完成 {pending.已完成份數 || 0} / {pending.總份數 || '?'} 份）。</p>
            <div class="actions">
              <button class="btn" onClick={() => { saveJob(site.工地ID, null); setPending(null); }}>放棄</button>
              <button class="btn primary" onClick={() => resume()}>繼續產生</button>
            </div>
          </div>
        )}
        <div class="fld"><span>狀態</span><div class="chips">{STATUS.map(s => <button type="button" class={'chip' + (sts.includes(s) ? ' on' : '')} onClick={() => toggle(s)} disabled={running}>{s}</button>)}</div></div>
        {blds.length > 0 && <label class="fld"><span>棟</span><select value={bld} onChange={e => setBld(e.target.value)} disabled={running}><option value="">全部</option>{blds.map(b => <option>{b}</option>)}</select></label>}
        <div class="row2">
          <label class="fld"><span>改善日期起</span><input type="date" value={from} onInput={e => setFrom(e.target.value)} disabled={running} /></label>
          <label class="fld"><span>迄</span><input type="date" value={to} onInput={e => setTo(e.target.value)} disabled={running} /></label>
        </div>
        {!running && <button class="btn primary block" onClick={gen}>產生報告</button>}
        {running && !prog?.背景 && <button class="btn ghost block" onClick={() => { stopRef.current = true; setNote('會在這一份完成後暫停，之後可按「繼續產生」'); }}>暫停</button>}

        {(running || prog) && (
          <div class="card">
            {prog?.筆數 != null && <p><b>{prog.筆數}</b> 筆{total > 1 ? `，分成 ${total} 份` : ''}</p>}
            {total > 1 && <>
              <div class="progress" role="progressbar" aria-valuemin="0" aria-valuemax={total} aria-valuenow={done}><span style={{ width: `${(done / total) * 100}%` }} /></div>
              <p class="small">已完成 {done} / {total} 份</p>
            </>}
            {note && <p class="muted small">{note}</p>}
            {prog?.完成 && total <= 1 && (prog.url || parts[0]?.網址) && <a class="btn primary block" href={prog.url || parts[0].網址} target="_blank" rel="noopener">開啟 PDF</a>}
            {total > 1 && prog?.資料夾網址 && <a class={'btn block' + (prog.完成 ? ' primary' : '')} href={prog.資料夾網址} target="_blank" rel="noopener">開啟資料夾</a>}
            {total > 1 && parts.length > 0 && (
              <ul class="list parts">
                {parts.map(pt => (
                  <li><a class="row" href={pt.網址} target="_blank" rel="noopener">
                    <span class="dinfo"><b>第 {pt.序} 份</b><small>{pt.起 && pt.迄 ? `No.${pt.起}–${pt.迄}・` : ''}{pt.筆數} 筆</small></span><span class="link">開啟</span>
                  </a></li>
                ))}
              </ul>
            )}
            {prog?.照片失敗 > 0 && <p class="warn small">有 {prog.照片失敗} 張照片讀不到，報告中以空白表示。</p>}
          </div>
        )}
      </main>
    </>
  );
}
