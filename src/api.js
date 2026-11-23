// API 呼叫：依 API 合約 POST JSON（text/plain 避開 CORS 預檢）。
import { config } from './config.js';
import { auth } from './auth.js';

export class ApiError extends Error {
  constructor(code, message, network = false) { super(message); this.code = code; this.network = network; }
}

let mockMod;
async function mockCall(action, data) {
  mockMod ||= await import('./mock.js');
  if (config.mockOffline) { await new Promise(r => setTimeout(r, 300)); throw new ApiError('NETWORK', '（模擬）沒有網路', true); }
  return mockMod.handle(action, data, auth.token());
}

export async function call(action, data = {}) {
  if (config.mock) return mockCall(action, data);
  if (!navigator.onLine) throw new ApiError('NETWORK', '目前沒有網路', true);
  const token = auth.token();
  const body = JSON.stringify({ action, idToken: token, data });
  let res;
  try {
    res = await fetch(config.apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body,
      redirect: 'follow'
    });
  } catch (e) {
    throw new ApiError('NETWORK', '連線失敗，請確認網路', true);
  }
  if (!res.ok) throw new ApiError('NETWORK', `伺服器暫時無法回應（${res.status}）`, true);
  let json;
  try { json = await res.json(); } catch { throw new ApiError('NETWORK', '伺服器回應格式錯誤', true); }
  if (!json.ok) {
    const err = json.error || {};
    throw new ApiError(err.code || 'ERROR', err.message || '發生錯誤');
  }
  return json.data;
}

export function errText(e) {
  if (!e) return '';
  if (e.code === 'OUT_OF_RANGE') return '不在工地範圍內：' + e.message;
  return e.message || String(e);
}
