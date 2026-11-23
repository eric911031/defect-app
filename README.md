# 工地缺失管理：前端手機網頁 App（W3）

Vite + Preact + vite-plugin-pwa。以 iPhone Safari 為主要對象，可「加入主畫面」。

## 開發
```bash
npm install
npm run dev        # http://localhost:5173 ，沒設 VITE_API_URL 時自動用示範資料
npm run build      # 輸出到 dist/
npm run preview    # http://localhost:4173 測試建置結果（含 Service Worker）
```
設定：複製 `.env.example` 為 `.env.local`，或在 App 的「設定」頁填後端網址與用戶端 ID（存在該瀏覽器，方便測試）。

## 結構
| 檔案 | 用途 |
| --- | --- |
| `src/api.js` | 依 API 合約呼叫後端（POST text/plain JSON） |
| `src/mock.js` | 示範用假後端（記憶體內，重新整理會重置） |
| `src/auth.js` | Google Identity Services 登入、token 保存 |
| `src/queue.js` + `src/db.js` | 離線佇列（IndexedDB），自動補送 |
| `src/photo.js` | 照片壓縮（長邊 1600px、約 300 KB） |
| `src/gps.js` | 定位與工地距離檢查 |
| `src/pages/*` | 各畫面 |

## 部署
`.github/workflows/pages.yml`推到 main 後自動發布到 GitHub Pages。
