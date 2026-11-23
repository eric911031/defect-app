import { haversine } from './util.js';
import { config } from './config.js';

export function hasCoords(site) {
  return site && site.緯度 !== '' && site.經度 !== '' && site.緯度 != null && site.經度 != null && !isNaN(+site.緯度) && !isNaN(+site.經度);
}
export function radiusOf(site) { return +(site?.['允許半徑(公尺)']) || 300; }

export function getPosition(site) {
  if (config.mock && config.mockGpsAtSite && hasCoords(site)) {
    return Promise.resolve({ lat: +site.緯度 + 0.0003, lng: +site.經度, acc: 10 });
  }
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error('此裝置不支援定位'));
    navigator.geolocation.getCurrentPosition(
      p => resolve({ lat: +p.coords.latitude.toFixed(6), lng: +p.coords.longitude.toFixed(6), acc: Math.round(p.coords.accuracy) }),
      e => reject(new Error(e.code === 1 ? '定位權限被拒絕，請到「設定 › Safari › 位置」允許' : '無法取得定位，請到戶外或稍後再試')),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 30000 }
    );
  });
}

// 回傳 {need, ok, dist, radius}
export function checkRange(site, pos) {
  if (!hasCoords(site)) return { need: false, ok: true };
  const radius = radiusOf(site);
  if (!pos) return { need: true, ok: false, radius };
  const dist = Math.round(haversine(pos.lat, pos.lng, +site.緯度, +site.經度));
  return { need: true, ok: dist <= radius, dist, radius };
}
