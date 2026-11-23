import { useMemo, useState } from 'preact/hooks';
import { useStore, toast } from '../store.js';
import { Header, PhotoInput, CodePicker, GpsLine, useGps, Chips } from '../components.jsx';
import { POSITIONS } from '../config.js';
import { floors, normUnit, toList, uuid, today } from '../util.js';
import { enqueue, flush } from '../queue.js';

const blank = { 棟: '', 樓層: '', 後綴: '', 戶別手填: '', 窗號: '', 順序: '1', 長度: '', 位置: '', 代碼: '', 備註: '' };

export function Register() {
  const { site } = useStore();
  const gps = useGps(site);
  const [f, setF] = useState(() => { try { return { ...blank, ...JSON.parse(sessionStorage.getItem('regDraft') || '{}') }; } catch { return blank; } });
  const [photo, setPhoto] = useState(null);
  const [manual, setManual] = useState(false);
  const [busy, setBusy] = useState(false);
  const set = (k, v) => setF(o => ({ ...o, [k]: v }));

  const blds = toList(site?.棟別清單);
  const flist = useMemo(() => floors(site?.樓層範圍), [site]);
  const sufs = toList(site?.戶別後綴清單);
  const useManual = manual || flist.length === 0;
  const unit = useManual ? normUnit(f.戶別手填) : normUnit(f.樓層 + (f.後綴 ? '-' + f.後綴 : ''));

  const problems = [];
  if (!photo) problems.push('改善前照片');
  if (blds.length && !f.棟) problems.push('棟');
  if (!unit) problems.push('戶別');
  if (!f.代碼 && !f.備註.trim()) problems.push('代碼或備註');
  const gpsBlock = gps.range.need && !gps.range.ok;

  async function submit(e) {
    e.preventDefault();
    if (problems.length) return toast('請填寫：' + problems.join('、'), 'err');
    if (gpsBlock) return toast(gps.err || '不在工地範圍內，不能送出', 'err');
    setBusy(true);
    const id = uuid();
    const data = { 缺失ID: id, 工地ID: site.工地ID, 棟: f.棟, 戶別: unit, 窗號: f.窗號.trim(), 順序: f.順序, 長度: f.長度, 位置: f.位置, 代碼: f.代碼, 備註: f.備註.trim(), GPS: gps.pos, 改善前照片: photo.base64, 登記日期: today() };
    try {
      await enqueue('createDefect', data, `${site.名稱} ${f.棟 ? f.棟 + '棟 ' : ''}${unit} ${f.窗號}`);
      const r = await flush();
      toast(r.stopped ? '已存到手機，有網路時會自動上傳' : '已送出', r.stopped ? 'warn' : 'ok');
      // 保留棟、戶別、窗號，方便連續登記；順序 +1
      const next = { ...f, 代碼: '', 備註: '', 長度: '', 位置: '', 順序: /^\d+$/.test(f.順序) ? String(+f.順序 + 1) : f.順序 };
      setF(next); setPhoto(null);
      sessionStorage.setItem('regDraft', JSON.stringify({ 棟: next.棟, 樓層: next.樓層, 後綴: next.後綴, 戶別手填: next.戶別手填, 窗號: next.窗號, 順序: next.順序 }));
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err) {
      toast('儲存失敗：' + err.message, 'err');
    } finally { setBusy(false); }
  }

  function newUnit() { setF(o => ({ ...o, 窗號: '', 順序: '1' })); sessionStorage.removeItem('regDraft'); }

  return (
    <>
      <Header title="登記缺失" />
      <form class="page form" onSubmit={submit}>
        <PhotoInput label="改善前照片" value={photo} onChange={setPhoto} />
        <GpsLine gps={gps} site={site} />

        {blds.length > 0 && <label class="fld"><span>棟</span><Chips options={blds} value={f.棟} onChange={v => set('棟', v)} /></label>}

        <div class="fld">
          <span>戶別 <b class="unit">{unit || '—'}</b>
            {flist.length > 0 && <button type="button" class="link" onClick={() => setManual(!manual)}>{useManual ? '用選單' : '手動輸入'}</button>}
          </span>
          {useManual ? (
            <input value={f.戶別手填} onInput={e => set('戶別手填', e.target.value)} placeholder="例如 15F-A1" autocapitalize="characters" />
          ) : (
            <div class="row2">
              <select value={f.樓層} onChange={e => set('樓層', e.target.value)}>
                <option value="">樓層</option>
                {flist.map(x => <option>{x}</option>)}
              </select>
              {sufs.length > 0 ? (
                <select value={f.後綴} onChange={e => set('後綴', e.target.value)}>
                  <option value="">戶（可不選）</option>
                  {sufs.map(x => <option>{x}</option>)}
                </select>
              ) : <input value={f.後綴} onInput={e => set('後綴', e.target.value.toUpperCase())} placeholder="戶（可空白）" autocapitalize="characters" />}
            </div>
          )}
        </div>

        <div class="row2">
          <label class="fld"><span>窗號</span><input value={f.窗號} onInput={e => set('窗號', e.target.value)} autocapitalize="characters" /></label>
          <label class="fld"><span>順序</span><input value={f.順序} onInput={e => set('順序', e.target.value)} inputmode="numeric" /></label>
        </div>

        <label class="fld"><span>缺失代碼</span><CodePicker value={f.代碼} onChange={v => set('代碼', v)} /></label>

        <label class="fld"><span>位置</span><Chips options={POSITIONS} value={f.位置} onChange={v => set('位置', v)} allowEmpty /></label>
        <label class="fld"><span>長度</span><input value={f.長度} onInput={e => set('長度', e.target.value)} inputmode="decimal" placeholder="選填" /></label>
        <label class="fld"><span>備註</span><textarea rows="2" value={f.備註} onInput={e => set('備註', e.target.value)} placeholder="沒有代碼時請寫缺失內容" /></label>

        <div class="actions sticky">
          <button type="button" class="btn ghost" onClick={newUnit}>換下一戶</button>
          <button class="btn primary" disabled={busy || gpsBlock}>{busy ? '儲存中…' : '送出'}</button>
        </div>
        {problems.length > 0 && <p class="hint">還沒填：{problems.join('、')}</p>}
      </form>
    </>
  );
}
