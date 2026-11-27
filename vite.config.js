import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';
import { VitePWA } from 'vite-plugin-pwa';

// S7：Content-Security-Policy（只加在建置結果；開發伺服器需要 inline 腳本做熱更新）。
// - script：自己 + Google 登入（GIS）
// - connect：自己 + Apps Script（POST 會轉址到 script.googleusercontent.com）+ GIS
// - img：自己、data:（照片 proxy 模式、待上傳照片）、blob:、Drive 縮圖（link 模式）
// - frame：GIS 登入視窗；style 的 'unsafe-inline'：GIS 按鈕與動態寬度（進度條）需要
// frame-ancestors 不能用 meta 設定（GitHub Pages 也不能加標頭），不在這裡。
const CSP = [
  "default-src 'self'",
  "script-src 'self' https://accounts.google.com/gsi/client",
  "style-src 'self' 'unsafe-inline' https://accounts.google.com/gsi/style",
  "img-src 'self' data: blob: https://drive.google.com https://*.googleusercontent.com https://*.gstatic.com",
  "connect-src 'self' https://script.google.com https://script.googleusercontent.com https://accounts.google.com/gsi/",
  "frame-src https://accounts.google.com/gsi/",
  "font-src 'self'",
  "worker-src 'self'",
  "manifest-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'"
].join('; ');
const cspPlugin = {
  name: 'csp-meta',
  apply: 'build',
  // 放在 charset 後面、所有 script 前面
  transformIndexHtml: {
    order: 'pre',
    handler: html => html.replace(/(<meta charset="utf-8" \/>)/, `$1\n  <meta http-equiv="Content-Security-Policy" content="${CSP}" />\n  <meta name="referrer" content="strict-origin-when-cross-origin" />`)
  }
};

export default defineConfig({
  base: './',
  plugins: [
    preact(),
    cspPlugin,
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: false,
      includeAssets: ['icon-180.png', 'icon.svg'],
      manifest: {
        name: '工地缺失管理',
        short_name: '缺失管理',
        description: '工地缺失登記、改善回報與確認',
        lang: 'zh-Hant-TW',
        start_url: './',
        scope: './',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#f6f6f3',
        theme_color: '#1f4e79',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,png,svg}'],
        navigateFallback: 'index.html',
        // 後端 API 與 Google 登入一律走網路，不快取
        navigateFallbackDenylist: [/^\/__/],
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.hostname === 'drive.google.com' || url.hostname.endsWith('googleusercontent.com'),
            handler: 'CacheFirst',
            options: { cacheName: 'photos', expiration: { maxEntries: 400, maxAgeSeconds: 60 * 60 * 24 * 30 }, cacheableResponse: { statuses: [0, 200] } }
          }
        ]
      }
    })
  ]
});
