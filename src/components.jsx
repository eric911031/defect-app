import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { useStore, toast, getState } from './store.js';
import { compressPhoto } from './photo.js';
import { getPosition, checkRange, hasCoords } from './gps.js';
import { cls, isReadOnly } from './util.js';
import { go } from './router.js';

export function Toast() {
  const t = useStore(s => s.toast);
  if (!t) return null;
  return <div class={cls('toast', t.kind)} role="status">{t.msg}</div>;
}

export function Spinner({ label = '載入中…' }) { return <div class="spinner"><span class="spin" />{label}</div>; }

export function StatusPill({ s }) {
  const k = { 未改善: 'todo', 待確認: 'wait', 已結案: 'done' }[s] || '';
  const icon = { 未改善: '!', 待確認: '?', 已結案: '✓' }[s] || '';
  return <span class={cls('pill', k)}>{icon} {s}</span>;
}

export function Header({ title, backTo, right }) {
  const { site, pending, online, syncing } = useStore();
  return (
    <>
    <header class="hdr">
      {backTo ? <button class="hdr-btn" onClick={() => (backTo === -1 ? history.back() : go(backTo))} aria-label="返回">‹</button>
        : <button class="hdr-site" onClick={() => go('/sites')}>{site ? site.名稱 : '選擇工地'}{isReadOnly(site) && <small class="ro">舊建案</small>} <span class="caret">▾</span></button>}
      <div class="hdr-title">{title}</div>
      <div class="hdr-right">
        {right}
        {(pending > 0 || !online) && (
          <button class={cls('sync', !online && 'off')} onClick={() => go('/queue')}>
            {!online ? '離線' : ''}{pending > 0 ? ` 待上傳 ${pending}` : ''}{syncing ? ' ⟳' : ''}
          </button>
        )}
      </div>
    </header>
    <Banners />
    </>
  );
}

// ---- 提醒橫幅（O6）----
// iPhone 用 Safari 開（不是主畫面 App）時，iOS 可能在 7 天沒開後清掉網站資料（含待上傳）。
export function isIos() {
  const ua = navigator.userAgent || '';
  return /iPhone|iPad|iPod/i.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}
export function isStandalone() {
  return navigator.standalone === true || (window.matchMedia && matchMedia('(display-mode: standalone)').matches);
}
const A2HS_KEY = 'a2hsHideUntil';
export function Banners() {
  const { pending, pendingOld } = useStore();
  const [hideUntil, setHideUntil] = useState(() => { try { return +localStorage.getItem(A2HS_KEY) || 0; } catch { return 0; } });
  const showA2hs = isIos() && !isStandalone() && (pending > 0 || hideUntil < Date.now());
  function hide() {
    const t = Date.now() + 3 * 86400e3; // 暫時關閉 3 天
    try { localStorage.setItem(A2HS_KEY, String(t)); } catch {}
    setHideUntil(t);
  }
  return (
    <>
      {pendingOld > 0 && (
        <div class="banner alert" role="alert">
          <span class="grow">⚠ 有 {pendingOld} 筆待上傳超過 24 小時還沒送出。請連上網路，到 <a href="#/queue">待上傳</a> 按「立即上傳」。</span>
        </div>
      )}
      {showA2hs && (
        <div class="banner" role="note">
          <span class="grow">
            {pending > 0 ? <b>手機上有 {pending} 筆待上傳。</b> : null}
            請把 App 加入主畫面再使用，資料比較不會被 Safari 清掉。<a href="#/help">怎麼加入</a>
          </span>
          {pending === 0 && <button class="x" aria-label="暫時關閉" onClick={hide}>×</button>}
        </div>
      )}
    </>
  );
}

const svg = d => <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">{d}</svg>;
const ICONS = {
  plus: svg(<><rect x="3" y="3" width="18" height="18" rx="4" /><path d="M12 8v8M8 12h8" /></>),
  list: svg(<path d="M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01" />),
  check: svg(<><circle cx="12" cy="12" r="9" /><path d="M8 12l3 3 5-6" /></>),
  chart: svg(<path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />),
  more: svg(<><circle cx="5" cy="12" r="1" /><circle cx="12" cy="12" r="1" /><circle cx="19" cy="12" r="1" /></>)
};

export function TabBar({ path }) {
  const { user, pending, site } = useStore();
  if (!user) return null;
  const r = user.角色;
  const tabs = [];
  if (r !== '改善者' && !isReadOnly(site)) tabs.push(['/register', '登記', ICONS.plus]);
  tabs.push(['/list', r === '改善者' ? '待改善' : '清單', ICONS.list]);
  if (r === '管理者') tabs.push(['/review', '確認', ICONS.check], ['/stats', '統計', ICONS.chart]);
  tabs.push(['/more', '更多', ICONS.more]);
  return (
    <nav class="tabs">
      {tabs.map(([p, label, icon]) => (
        <a href={'#' + p} class={cls('tab', path.startsWith(p) && 'on')}>
          <span class="ti">{icon}</span>{label}
          {p === '/more' && pending > 0 && <span class="badge">{pending}</span>}
        </a>
      ))}
    </nav>
  );
}

// 拍照：用原生相機（capture），選完立刻壓縮
export function PhotoInput({ label, value, onChange }) {
  const ref = useRef();
  const [busy, setBusy] = useState(false);
  async function pick(e) {
    const f = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!f) return;
    setBusy(true);
    try { onChange(await compressPhoto(f)); } catch (err) { toast(err.message, 'err'); } finally { setBusy(false); }
  }
  return (
    <div class="photo">
      <input ref={ref} type="file" accept="image/*" capture="environment" onChange={pick} hidden />
      {value ? (
        <div class="photo-prev" onClick={() => ref.current.click()}>
          <img src={value.dataUrl} alt={label} />
          <span class="photo-meta">{Math.round(value.bytes / 1024)} KB・點一下重拍</span>
        </div>
      ) : (
        <button type="button" class="photo-btn" onClick={() => ref.current.click()} disabled={busy}>
          <span class="cam">📷</span>{busy ? '處理照片中…' : `拍攝${label}`}
        </button>
      )}
    </div>
  );
}

// GPS 狀態：進畫面就定位，顯示距離
export function useGps(site) {
  const [pos, setPos] = useState(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  async function refresh() {
    if (!site) return;
    setBusy(true); setErr('');
    try { setPos(await getPosition(site)); } catch (e) { setErr(e.message); setPos(null); } finally { setBusy(false); }
  }
  useEffect(() => { refresh(); }, [site?.工地ID]);
  const range = checkRange(site, pos);
  return { pos, err, busy, range, refresh };
}

export function GpsLine({ gps, site }) {
  const { range, err, busy, refresh, pos } = gps;
  let text, kind;
  if (!hasCoords(site)) { text = '此工地未設座標，不檢查位置'; kind = 'muted'; }
  else if (busy) { text = '定位中…'; kind = 'muted'; }
  else if (err) { text = err; kind = 'bad'; }
  else if (range.ok) { text = `✓ 在工地範圍內（距離 ${range.dist} m，允許 ${range.radius} m）`; kind = 'ok'; }
  else if (pos) { text = `✕ 距離工地 ${range.dist} m，超過允許的 ${range.radius} m`; kind = 'bad'; }
  else { text = '尚未定位'; kind = 'muted'; }
  return (
    <div class={cls('gps', kind)}>
      <span>{text}</span>
      {hasCoords(site) && <button type="button" class="link" onClick={refresh} disabled={busy}>重新定位</button>}
    </div>
  );
}

export function Modal({ title, onClose, children, full }) {
  useEffect(() => { document.body.classList.add('noscroll'); return () => document.body.classList.remove('noscroll'); }, []);
  return (
    <div class="modal-bg" onClick={e => e.target === e.currentTarget && onClose()}>
      <div class={cls('modal', full && 'full')}>
        <div class="modal-hdr"><b>{title}</b><button class="link" onClick={onClose}>關閉</button></div>
        <div class="modal-body">{children}</div>
      </div>
    </div>
  );
}

// 可搜尋的代碼選擇器；最近用過的排前面
export function CodePicker({ value, onChange }) {
  const codes = useStore(s => s.codes);
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const recent = useMemo(() => { try { return JSON.parse(localStorage.getItem('recentCodes') || '[]'); } catch { return []; } }, [open]);
  const cur = codes.find(c => c.代碼 === value);
  const list = useMemo(() => {
    const k = q.trim().toUpperCase();
    let l = codes.filter(c => !k || `${c.代碼} ${c.分類} ${c.內容} ${c.種類}`.toUpperCase().includes(k));
    if (!k) l = [...recent.map(r => codes.find(c => c.代碼 === r)).filter(Boolean), ...l.filter(c => !recent.includes(c.代碼))];
    return l;
  }, [codes, q, recent]);
  function choose(code) {
    onChange(code);
    setOpen(false); setQ('');
    if (code) try { localStorage.setItem('recentCodes', JSON.stringify([code, ...recent.filter(r => r !== code)].slice(0, 8))); } catch {}
  }
  return (
    <>
      <button type="button" class={cls('select', !cur && 'ph')} onClick={() => setOpen(true)}>
        {cur ? <><b>{cur.代碼}</b> {cur.內容}</> : value || '選擇代碼（可搜尋）'}
      </button>
      {open && (
        <Modal title="選擇缺失代碼" onClose={() => setOpen(false)} full>
          <input class="search" type="search" placeholder="搜尋代碼或內容，例如 A15、壓條" value={q} onInput={e => setQ(e.target.value)} autoFocus />
          <ul class="codes">
            <li><button class="code-row" onClick={() => choose('')}><b>—</b> 不選代碼（寫在備註）</button></li>
            {list.map((c, i) => (
              <li key={c.代碼}>
                <button class={cls('code-row', c.代碼 === value && 'on')} onClick={() => choose(c.代碼)}>
                  <b>{c.代碼}</b> {c.內容 || <i class="muted">（無內容）</i>}
                  <small>{c.分類}{!q && i < recent.length ? '・最近使用' : ''}</small>
                </button>
              </li>
            ))}
          </ul>
        </Modal>
      )}
    </>
  );
}

export function Chips({ options, value, onChange, allowEmpty }) {
  return (
    <div class="chips">
      {options.map(o => (
        <button type="button" class={cls('chip', o === value && 'on')} onClick={() => onChange(allowEmpty && o === value ? '' : o)}>{o}</button>
      ))}
    </div>
  );
}

export function Empty({ children }) { return <div class="empty">{children}</div>; }

// 照片縮圖：沒有現成網址時，用 photos action 批次載入（每次最多 20 張，只載入捲到畫面上的）
// 照片不存到手機（使用者決定只下載文字）：離線或載入失敗時顯示提示，恢復網路後自動重新載入。
import { call } from './api.js';
const OFFLINE = Symbol('offline');
const photoCache = new Map();
let pendingIds = new Map(), timer = null;
// 照片ID 可能是 AppSheet 路徑字串（各工地可能重複），快取與請求都以「工地ID + 照片ID」區分
function requestPhoto(id) {
  if (!navigator.onLine) return Promise.resolve(OFFLINE);
  const siteId = getState().site?.工地ID || '';
  const key = siteId + '|' + id;
  if (photoCache.has(key)) return photoCache.get(key);
  const p = new Promise(resolve => { pendingIds.set(key, resolve); });
  photoCache.set(key, p);
  clearTimeout(timer);
  timer = setTimeout(flushPhotos, 60);
  return p;
}
async function flushPhotos() {
  const batch = pendingIds; pendingIds = new Map();
  // 依工地分組，每次最多 20 張
  const bySite = new Map();
  for (const key of batch.keys()) {
    const i = key.indexOf('|'), s = key.slice(0, i);
    if (!bySite.has(s)) bySite.set(s, []);
    bySite.get(s).push(key);
  }
  for (const [siteId, keys] of bySite) {
    for (let i = 0; i < keys.length; i += 20) {
      const chunk = keys.slice(i, i + 20);
      const ids = chunk.map(k => k.slice(k.indexOf('|') + 1));
      try {
        const r = await call('photos', { 檔案ID: ids, 尺寸: 400, 工地ID: siteId || undefined });
        chunk.forEach((k, j) => { const u = r[ids[j]] || null; photoCache.set(k, Promise.resolve(u)); batch.get(k)(u); });
      } catch (e) {
        // 連線問題：不快取，之後恢復網路會重試
        chunk.forEach(k => { photoCache.delete(k); batch.get(k)(e && e.network ? OFFLINE : null); });
      }
    }
  }
}
const isRemote = u => typeof u === 'string' && /^https?:/i.test(u);
export function Thumb({ url, fileId, cls: c = 'thumb' }) {
  const ref = useRef();
  const online = useStore(s => s.online);
  const [src, setSrc] = useState(url || null);
  const [off, setOff] = useState(false);   // 離線中，照片需連線
  const [fail, setFail] = useState(false); // 有網路但載不到
  useEffect(() => {
    setFail(false);
    if (url) {
      // 遠端網址離線時載不到；本機（data:）照片照常顯示
      setSrc(url); setOff(isRemote(url) && !navigator.onLine);
      return;
    }
    if (!fileId || !ref.current) return;
    setOff(false);
    let live = true;
    const io = new IntersectionObserver(es => {
      if (es.some(e => e.isIntersecting)) {
        io.disconnect();
        requestPhoto(fileId).then(u => { if (!live) return; if (u === OFFLINE) { setOff(true); setSrc(null); } else { setSrc(u); setOff(false); if (!u) setFail(true); } });
      }
    }, { rootMargin: '200px' });
    io.observe(ref.current);
    return () => { live = false; io.disconnect(); };
  }, [url, fileId, online]);
  const big = c !== 'thumb';
  if (!url && !fileId) return <span class={c + ' none'}>無照片</span>;
  if (off) return <span ref={ref} class={c + ' none off'} title="離線中，照片需連線才能顯示">{big ? '離線中，照片需連線才能顯示' : '離線'}</span>;
  if (src) return <img ref={ref} class={c} src={src} loading="lazy" alt="" onError={() => { if (!navigator.onLine) setOff(true); else { setSrc(null); setFail(true); } }} />;
  return <span ref={ref} class={c + ' none'}>{fail ? (big ? '照片載入失敗' : '失敗') : '…'}</span>;
}
