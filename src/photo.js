// 前端照片壓縮：長邊 1600px、JPEG，目標約 300 KB。
// iOS Safari 13.4+ 畫到 canvas 時會自動套用 EXIF 方向。
const MAX = 1600, TARGET = 350 * 1024;

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('無法讀取照片')); };
    img.src = url;
  });
}

export async function compressPhoto(file) {
  const img = await loadImage(file);
  const w0 = img.naturalWidth, h0 = img.naturalHeight;
  const scale = Math.min(1, MAX / Math.max(w0, h0));
  const w = Math.round(w0 * scale), h = Math.round(h0 * scale);
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h);
  ctx.drawImage(img, 0, 0, w, h);
  let q = 0.82, dataUrl;
  for (;;) {
    dataUrl = canvas.toDataURL('image/jpeg', q);
    if (dataUrl.length * 0.75 <= TARGET || q <= 0.5) break;
    q -= 0.08;
  }
  canvas.width = canvas.height = 0; // 釋放 iOS canvas 記憶體
  const base64 = dataUrl.slice(dataUrl.indexOf(',') + 1);
  return { dataUrl, base64, width: w, height: h, bytes: Math.round(base64.length * 0.75) };
}
