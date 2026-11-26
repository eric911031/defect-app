import { render } from 'preact';
import { App } from './App.jsx';
import './style.css';
import { registerSW } from 'virtual:pwa-register';

// 有新版時自動更新並重新載入；開著 App 時每 30 分鐘檢查一次
registerSW({
  immediate: true,
  onRegisteredSW(_url, reg) { if (reg) setInterval(() => reg.update().catch(() => {}), 30 * 60 * 1000); }
});

// 要求持久儲存，降低 iOS 清掉待上傳資料的機率
if (navigator.storage?.persist) navigator.storage.persist().catch(() => {});

render(<App />, document.getElementById('app'));
