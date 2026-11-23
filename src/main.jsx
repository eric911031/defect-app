import { render } from 'preact';
import { App } from './App.jsx';
import './style.css';

// 要求持久儲存，降低 iOS 清掉待上傳資料的機率
if (navigator.storage?.persist) navigator.storage.persist().catch(() => {});

render(<App />, document.getElementById('app'));
