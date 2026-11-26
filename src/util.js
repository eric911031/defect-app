export function uuid() {
  if (crypto.randomUUID) return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40; b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map(x => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

// 戶別：大寫、去空白，例如 "15f - a1" → "15F-A1"
export function normUnit(s) { return String(s || '').toUpperCase().replace(/\s+/g, ''); }
export function normCode(s) { return String(s || '').toUpperCase().replace(/\s+/g, ''); }

export function today() {
  const d = new Date(Date.now() + 8 * 3600e3); // Asia/Taipei
  return d.toISOString().slice(0, 10);
}

export function toList(v) {
  if (Array.isArray(v)) return v.map(String).map(s => s.trim()).filter(Boolean);
  return String(v || '').split(/[,，、\s]+/).map(s => s.trim()).filter(Boolean);
}

// 樓層範圍 "1-23"、"B2-15"、"1-3,5,7" → ["1F",...]
export function floors(range) {
  const out = [];
  for (const part of toList(range)) {
    const m = part.match(/^(B?)(\d+)\s*[-~]\s*(B?)(\d+)$/i);
    if (m) {
      const a = (m[1] ? -1 : 1) * +m[2], b = (m[3] ? -1 : 1) * +m[4];
      for (let i = Math.min(a, b); i <= Math.max(a, b); i++) if (i !== 0) out.push(i < 0 ? `B${-i}F` : `${i}F`);
    } else if (/^B?\d+F?$/i.test(part)) out.push(part.toUpperCase().replace(/F?$/, 'F'));
  }
  return [...new Set(out)];
}

export function haversine(lat1, lng1, lat2, lng2) {
  const R = 6371000, r = Math.PI / 180;
  const dLat = (lat2 - lat1) * r, dLng = (lng2 - lng1) * r;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * r) * Math.cos(lat2 * r) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

export function cls(...a) { return a.filter(Boolean).join(' '); }

export function fmtTime(ts) {
  const d = new Date(ts);
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

// 唯讀工地：6 個舊建案（全部已結案，不能新增或修改）
export const isReadOnly = site => !!site && (site.唯讀 === true || site.啟用 === false);

// 由戶別解析樓層：2A1 → 2F / A1、12B3 → 12F / B3、20F - A2 → 20F / A2、B1A1 → B1 / A1、10樓梯廳 → 10F / 梯廳。
// 認不出來的（例如「右邊R1F」、純數字 301）回傳 floor = null，畫面放到「其他」。
// letterUnits：這個工地的戶別是「樓層數字＋一個字母」（10B、11F＝11 樓 F 戶），此時結尾的 F 是戶別不是樓層
export function parseUnit(raw, letterUnits = false) {
  let s = String(raw || '').toUpperCase().replace(/\s+/g, '').replace(/[－—–~～]/g, '-');
  if (!s) return { floor: null, label: '其他', unit: '' };
  s = s.replace(/^[A-Z]棟/, ''); // 「C棟R2F」：棟已在棟欄
  let m;
  if (letterUnits && (m = s.match(/^(\d{1,2})([A-Z])$/)) && Number(m[1]) > 0) {
    const n = Number(m[1]);
    return { floor: n, label: `${n}F`, unit: m[2] };
  }
  // 屋頂：R1、R2（沒有 F）
  if ((m = s.match(/^R(\d{1,2})(?:[-_.]|(?=[\u4e00-\u9fff])|$)(.*)$/))) { const n = Number(m[1]); return { floor: 1000 + n, label: `R${n}F`, unit: m[2] || '' }; }
  // 屋頂：RF、R1F、R2F（排在最高樓層之後）
  if ((m = s.match(/^R(\d{0,2})F(?:[-_.]|$)?(.*)$/))) {
    const n = Number(m[1] || 1);
    return { floor: 1000 + n, label: m[1] ? `R${n}F` : 'RF', unit: m[2] || '' };
  }
  // 地下室：B1、B2F、B1-A1、B1FA1
  if ((m = s.match(/^B(\d{1,2})F?(?:[-_.]|(?=[A-Z])|$)(.*)$/))) {
    return { floor: -Number(m[1]), label: `B${Number(m[1])}`, unit: m[2] || '' };
  }
  // 2A1、12B3、20F-A2、15F、2-1、10樓梯廳、3樓A1、5F廁所
  if ((m = s.match(/^(\d{1,2})(?:F|樓)?(?:[-_.]|(?=[A-Z一-鿿])|$)(.*)$/))) {
    const n = Number(m[1]);
    if (n > 0 && !(/^\d+$/.test(s) && s.length > 2)) return { floor: n, label: `${n}F`, unit: m[2] || '' };
  }
  // 3～4 位純數字：2301 → 23F / 01、301 → 3F / 01（舊資料常見）
  if ((m = s.match(/^(\d{1,2})(\d{2})$/)) && Number(m[1]) > 0) {
    const n = Number(m[1]);
    return { floor: n, label: `${n}F`, unit: m[2] };
  }
  // 描述裡帶樓層：「右邊R1F」「店舖1F夾層」
  if ((m = s.match(/R(\d{0,2})F/))) { const n = Number(m[1] || 1); return { floor: 1000 + n, label: m[1] ? `R${n}F` : 'RF', unit: s.replace(m[0], '') || '' }; }
  if ((m = s.match(/(\d{1,2})(?:F|樓)/)) && Number(m[1]) > 0) { const n = Number(m[1]); return { floor: n, label: `${n}F`, unit: s }; }
  return { floor: null, label: '其他', unit: s };
}

// 判斷一批戶別是否屬於「數字＋單一字母」的寫法（安家藏玉、信義嘉品）
export function detectLetterUnits(units) {
  let letter = 0, other = 0;
  for (const u of units) {
    const s = String(u || '').toUpperCase().replace(/\s+/g, '');
    if (/^\d{1,2}[A-EG-Z]$/.test(s)) letter++;
    else if (/^\d{1,2}(F|樓)?[-_.]?[A-Z]\d/.test(s)) other++;
  }
  return letter >= 3 && letter > other;
}
