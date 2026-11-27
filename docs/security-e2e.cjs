// 安全與離線確認流程 E2E（SO-S）：iPhone 視窗。
// 1) 示範建置：npm run build:demo && npx vite preview --outDir dist-demo --port 4173
// 2) 正式建置：npm run build && npx vite preview --port 4174
// 執行：node docs/security-e2e.cjs <截圖資料夾>
const { chromium, devices } = require('playwright');
const path = require('path');
const OUT = process.argv[2];
const DEMO = 'http://localhost:4173/', PROD = 'http://localhost:4174/';
const results = [];
const check = (name, ok, extra = '') => { results.push(`${ok ? 'PASS' : 'FAIL'} ${name}${extra ? ' — ' + extra : ''}`); };

const idb = (page, store) => page.evaluate(s => new Promise(res => {
  const r = indexedDB.open('defect-app');
  r.onsuccess = () => { const q = r.result.transaction(s).objectStore(s); const g = s === 'kv' ? q.getAllKeys() : q.getAll(); g.onsuccess = () => res(g.result); };
}), store);

async function newPage(browser, base, email) {
  const ctx = await browser.newContext({ ...devices['iPhone 13'], deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  page.on('pageerror', e => results.push('PAGEERROR ' + e.message));
  page.on('dialog', d => d.accept());
  if (email) {
    await page.goto(base);
    await page.evaluate(e => {
      localStorage.setItem('cfg.mock', '1');
      localStorage.setItem('auth', JSON.stringify({ kind: 'mock', mockEmail: e, email: e, exp: Date.now() + 864e5 }));
      localStorage.setItem('siteId', 'DY');
      localStorage.setItem('a2hsHideUntil', String(Date.now() + 864e5));
    }, email);
    await page.reload();
    await page.waitForSelector('.hdr');
    if (await page.locator('text=選擇工地').count()) await page.click('text=敦仰');
    await page.waitForSelector('.tabs');
  }
  return { ctx, page };
}

(async () => {
  const browser = await chromium.launch();
  const shot = (page, n) => page.screenshot({ path: path.join(OUT, n + '.png') });
  const wait = (page, ms) => page.waitForTimeout(ms);

  // ===== 正式建置：S3、S7 =====
  {
    const ctx = await browser.newContext({ ...devices['iPhone 13'], deviceScaleFactor: 2 });
    const page = await ctx.newPage();
    const csp = [], hosts = new Set();
    page.on('console', m => { if (/Content Security Policy|Refused to/i.test(m.text())) csp.push(m.text()); });
    page.on('request', r => hosts.add(new URL(r.url()).host));
    // 後端一律回 UNAUTHENTICATED（不碰真的後端）
    await page.route(/script\.google\.com/, r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: false, error: { code: 'UNAUTHENTICATED', message: '請重新登入' } }) }));
    await page.route(/evil\.example/, r => r.fulfill({ status: 200, body: '{}' }));
    await page.goto(PROD);
    await page.evaluate(() => {
      localStorage.setItem('cfg.mock', '1');                              // 正式版不能開示範模式
      localStorage.setItem('cfg.apiUrl', 'https://evil.example/exec');   // 不合格的後端網址
      localStorage.setItem('auth', JSON.stringify({ kind: 'google', sessionToken: 's1.fake', email: 'x@y', exp: null }));
    });
    await page.goto(PROD + '#/settings');
    await page.reload();
    await page.waitForSelector('.login', { timeout: 15000 });
    await wait(page, 2500);
    const txt = await page.locator('body').innerText();
    check('正式版：未登入開 #/settings 只看到登入頁', !/後端網址/.test(txt) && /請用公司登記的 Google 帳號登入/.test(txt));
    check('正式版：沒有示範模式（cfg.mock 無效）', !/示範模式/.test(txt));
    check('正式版：登入頁沒有「設定」連結', await page.locator('a[href="#/settings"]').count() === 0);
    check('正式版：不合格的後端網址被忽略', !hosts.has('evil.example') && hosts.has('script.google.com'), [...hosts].join(', '));
    check('正式版：有改過設定時可「恢復預設設定」', /恢復預設設定/.test(txt));
    const meta = await page.locator('meta[http-equiv="Content-Security-Policy"]').getAttribute('content');
    check('正式版：index.html 有 CSP', /default-src 'self'/.test(meta || ''));
    const gisFrame = await page.locator('iframe[src*="accounts.google.com/gsi"]').count();
    check('CSP 下 Google 登入按鈕可載入', gisFrame > 0 || hosts.has('accounts.google.com'), `iframe ${gisFrame}`);
    check('CSP 沒有擋到任何資源', csp.length === 0, csp.slice(0, 3).join(' | '));
    const mockChunk = [...hosts].length && await page.evaluate(() => performance.getEntriesByType('resource').some(e => /mock/.test(e.name)));
    check('正式版沒有載入假資料程式', !mockChunk);
    await shot(page, 'sec-01-prod-login');
    await ctx.close();
  }

  // ===== 示範建置：O4 / O5 / 管理 / 登出 =====
  const { ctx, page } = await newPage(browser, DEMO, 'admin@test');
  const csp2 = [];
  page.on('console', m => { if (/Content Security Policy|Refused to/i.test(m.text())) csp2.push(m.text()); });

  // 管理者可以開設定頁，網址檢查
  await page.goto(DEMO + '#/settings');
  await page.waitForSelector('text=後端網址');
  await page.fill('input[placeholder^="https://script.google.com"]', 'https://evil.example/exec');
  const bad = await page.locator('text=只接受 https://script.google.com/macros/s/').count();
  check('設定頁拒絕非 Apps Script 網址', bad > 0);
  await page.fill('input[placeholder^="https://script.google.com"]', '');
  await page.goto(DEMO + '#/more');

  // 下載離線資料
  await page.click('button:has-text("下載離線資料")');
  await page.waitForSelector('text=上次下載', { timeout: 20000 });

  // --- O4：離線確認、退回、編輯 ---
  await ctx.setOffline(true); await wait(page, 300);
  await page.goto(DEMO + '#/defect/seed-DY-7');
  await page.waitForSelector('.dhead');
  await page.click('.actions button:has-text("通過")');
  await wait(page, 1200);
  let t = await page.locator('main').innerText();
  check('離線「通過」存到手機並顯示已結案', /已結案/.test(t) && /確認（通過）還在手機上/.test(t));
  await shot(page, 'sec-02-offline-approve');

  await page.goto(DEMO + '#/review');
  await page.waitForSelector('article.rv');
  const before = await page.locator('article.rv').count();
  await page.locator('article.rv').first().locator('button:has-text("退回")').click();
  await page.click('.modal .chip:has-text("未改善完成")');
  await page.click('.modal button:has-text("確定退回")');
  await wait(page, 1200);
  const after = await page.locator('article.rv').count();
  check('離線「退回」後從待確認清單移除', after === before - 1, `${before} → ${after}`);

  await page.goto(DEMO + '#/defect/seed-DY-1');
  await page.waitForSelector('.dhead');
  await page.click('.hdr-btn:has-text("編輯")');
  await page.fill('.modal textarea', '離線編輯的備註');
  await page.click('.modal button:has-text("儲存")');
  await wait(page, 1200);
  t = await page.locator('main').innerText();
  check('離線編輯立即反映並標待上傳', /離線編輯的備註/.test(t) && /編輯還在手機上/.test(t));
  await shot(page, 'sec-03-offline-edit');

  await page.goto(DEMO + '#/list');
  await page.waitForSelector('.grp');
  await page.click('.chip:has-text("全部")'); await wait(page, 600);
  for (const h of await page.locator('.grp-hdr').all()) { await h.click().catch(() => {}); }
  await wait(page, 400);
  const tags = await page.locator('.tag-pending').allInnerTexts();
  check('清單標示待上傳・確認／退回／編輯', ['確認', '退回', '編輯'].every(k => tags.some(x => x.includes(k))), tags.join(','));
  await shot(page, 'sec-04-list-pending');

  // --- O5：製造衝突 ---
  // 另一筆待確認：離線通過；同時別人把它結案（模擬）
  const queued = (await idb(page, 'queue')).map(i => i.data.缺失ID);
  const pick = () => page.evaluate(ex => window.__mockDb.缺失.filter(d => d.工地ID === 'DY' && d.狀態 === '待確認' && !ex.includes(d.缺失ID)).map(d => d.缺失ID), queued);
  const waiting = await pick();
  const RV = waiting[0], RV2 = waiting[1], RV3 = waiting[2];
  await page.goto(DEMO + '#/defect/' + RV);
  await page.waitForSelector('.dhead');
  await page.click('.actions button:has-text("通過")'); await wait(page, 800);
  // seed-DY-2：離線編輯；同時別人改了備註
  await page.goto(DEMO + '#/defect/seed-DY-2');
  await page.waitForSelector('.dhead');
  await page.click('.hdr-btn:has-text("編輯")');
  await page.fill('.modal textarea', '我的版本');
  await page.click('.modal button:has-text("儲存")'); await wait(page, 800);
  await page.evaluate(RV => {
    const db = window.__mockDb.缺失;
    const a = db.find(d => d.缺失ID === RV); Object.assign(a, { 狀態: '已結案', 確認人: 'boss@test', 更新時間: new Date().toISOString() });
    const b = db.find(d => d.缺失ID === 'seed-DY-2'); Object.assign(b, { 備註: '別人的版本', 更新時間: new Date().toISOString() });
  }, RV);
  await ctx.setOffline(false);
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  await page.waitForSelector('.banner.alert:has-text("衝突")', { timeout: 15000 });
  check('衝突時顯示醒目提示', true);
  const sent = await page.evaluate(() => {
    const db = window.__mockDb.缺失, f = id => db.find(d => d.缺失ID === id);
    return { a: f('seed-DY-7').狀態, b: f('seed-DY-1').備註 };
  });
  check('恢復網路後確認、編輯自動送出', sent.a === '已結案' && sent.b === '離線編輯的備註', JSON.stringify(sent));
  await page.goto(DEMO + '#/queue');
  await page.waitForSelector('article.conflict');
  const cards = await page.locator('article.conflict').count();
  check('待上傳頁列出 2 筆衝突', cards === 2, String(cards));
  const cmp = await page.locator('article.conflict').allInnerTexts();
  const rvCard = cmp.findIndex(x => /確認/.test(x.split('\n')[0]));
  const edCard = cmp.findIndex(x => /編輯/.test(x.split('\n')[0]));
  check('並列「你的版本／目前版本」', /我的版本/.test(cmp[edCard]) && /別人的版本/.test(cmp[edCard]));
  check('已結案的確認只能放棄', !/用我的覆蓋/.test(cmp[rvCard]) && /已經不能再確認/.test(cmp[rvCard]));
  await shot(page, 'sec-05-conflict');
  await page.locator('article.conflict').nth(edCard).locator('button:has-text("用我的覆蓋")').click();
  await wait(page, 1500);
  const ow = await page.evaluate(() => window.__mockDb.缺失.find(d => d.缺失ID === 'seed-DY-2').備註);
  check('「用我的覆蓋」重送成功', ow === '我的版本', ow);
  await page.locator('article.conflict').first().locator('button:has-text("放棄我的")').click();
  await wait(page, 800);
  const q = await idb(page, 'queue');
  check('「放棄我的」後佇列清空', q.length === 0, String(q.length));
  await shot(page, 'sec-06-conflict-resolved');

  // --- 管理頁：強制重新登入 ---
  await page.goto(DEMO + '#/manage');
  await page.waitForSelector('.row-wrap');
  await page.locator('.row-wrap', { hasText: '陳登記' }).locator('button.side').click();
  await wait(page, 1000);
  const ver = await page.evaluate(() => window.__mockDb.使用者.find(u => u.Email === 'reg@test').憑證版本);
  check('強制重新登入：對方憑證版本 +1', ver === 2, String(ver));
  await shot(page, 'sec-07-manage-revoke');

  // --- S5：登出時有待上傳 ---
  await ctx.setOffline(true); await wait(page, 300);
  await page.goto(DEMO + '#/defect/' + RV2);
  await page.waitForSelector('.dhead');
  await page.click('.actions button:has-text("通過")'); await wait(page, 800);
  await page.goto(DEMO + '#/more');
  await page.click('button:has-text("登出")');
  await page.waitForSelector('.modal:has-text("還有資料沒有上傳")');
  const upDisabled = await page.locator('.modal button:has-text("上傳後登出")').isDisabled();
  check('離線時「上傳後登出」不能按', upDisabled);
  await shot(page, 'sec-08-logout-ask');
  await ctx.setOffline(false);
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  await wait(page, 300);
  // 恢復網路時佇列會自動送；為了測「上傳後登出」，先確認還有 1 筆或已送完都能登出
  await page.locator('.modal button:has-text("上傳後登出")').click().catch(() => {});
  await page.waitForSelector('.login', { timeout: 15000 }).catch(() => {});
  const loggedOut = await page.locator('.login').count();
  const q2 = await idb(page, 'queue'), kv2 = await idb(page, 'kv');
  const adminVer = await page.evaluate(() => window.__mockDb.使用者.find(u => u.Email === 'admin@test').憑證版本);
  check('上傳後登出：已上傳、已登出、快取清空', loggedOut > 0 && q2.length === 0 && kv2.length === 0, `queue ${q2.length}, kv ${kv2.join(',')}`);
  check('登出呼叫後端 logout（憑證版本 +1）', adminVer === 2, String(adminVer));

  // 放棄並清除
  await page.click('button:has-text("管理者")');
  await page.waitForSelector('.hdr');
  if (await page.locator('text=選擇工地').count()) await page.click('text=敦仰');
  await page.waitForSelector('.tabs');
  await page.goto(DEMO + '#/defect/' + RV3);
  await page.waitForSelector('.dhead');
  await ctx.setOffline(true); await wait(page, 300);
  await page.click('.actions button:has-text("通過")'); await wait(page, 800);
  await page.goto(DEMO + '#/more');
  await page.click('button:has-text("登出")');
  await page.click('.modal button:has-text("放棄並清除")');
  await page.waitForSelector('.login', { timeout: 10000 });
  const q3 = await idb(page, 'queue');
  check('放棄並清除：待上傳刪除並登出', q3.length === 0);
  await ctx.setOffline(false);

  // 換帳號：沒有登出就換人登入，前一人的快取要清掉
  await page.click('button:has-text("管理者")');
  await page.waitForSelector('.hdr');
  if (await page.locator('text=選擇工地').count()) await page.click('text=敦仰');
  await page.waitForSelector('.tabs');
  await page.goto(DEMO + '#/more');
  await page.click('button:has-text("下載離線資料")');
  await page.waitForSelector('text=上次下載', { timeout: 20000 });
  const kvA = await idb(page, 'kv');
  await page.evaluate(() => localStorage.setItem('auth', JSON.stringify({ kind: 'mock', mockEmail: 'reg@test', email: 'reg@test', exp: Date.now() + 864e5 })));
  await page.reload();
  await page.waitForSelector('.hdr');
  await wait(page, 1000);
  const kvB = await idb(page, 'kv');
  check('換成不同帳號時清掉前一人的離線資料', kvA.includes('offline:meta') && !kvB.includes('offline:meta'), `前 ${kvA.length} 個鍵 → 後 ${kvB.join(',')}`);
  check('示範版 CSP 沒有擋到任何資源', csp2.length === 0, csp2.slice(0, 2).join(' | '));

  await browser.close();
  console.log(results.join('\n'));
  const fails = results.filter(r => !r.startsWith('PASS')).length;
  console.log(`\n${results.length - fails} / ${results.length} 通過`);
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(results.join('\n')); console.error(e); process.exit(1); });
