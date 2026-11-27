// 離線流程 E2E：iPhone 視窗 + 示範資料（mock）+ context.setOffline
const { chromium, devices } = require('playwright');
const path = require('path');
const OUT = process.argv[2];
const URL = 'http://localhost:4173/';
const results = [];
const check = (name, ok, extra = '') => { results.push(`${ok ? 'PASS' : 'FAIL'} ${name}${extra ? ' — ' + extra : ''}`); };

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ ...devices['iPhone 13'], deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  page.on('pageerror', e => results.push('PAGEERROR ' + e.message));
  const shot = n => page.screenshot({ path: path.join(OUT, n + '.png') });
  const wait = ms => page.waitForTimeout(ms);

  await page.goto(URL);
  await page.evaluate(() => {
    localStorage.setItem('cfg.mock', '1');
    localStorage.setItem('auth', JSON.stringify({ kind: 'mock', mockEmail: 'admin@test', email: 'admin@test', exp: Date.now() + 864e5 }));
    localStorage.setItem('siteId', 'DY');
  });
  await page.reload();
  await page.waitForSelector('.hdr');
  // 選工地
  if (await page.locator('text=選擇工地').count()) { await page.click('text=敦仰'); }
  await page.waitForSelector('.tabs');

  // 1. iOS 加入主畫面提示
  check('iPhone Safari 顯示加入主畫面提示', await page.locator('.banner >> text=加入主畫面').count() > 0);
  await shot('offline-01-a2hs-banner');

  // 2. 下載離線資料
  await page.goto(URL + '#/more');
  await page.click('button:has-text("下載離線資料")');
  await page.waitForSelector('text=上次下載', { timeout: 20000 });
  const metaTxt = await page.locator('section.card').first().innerText();
  check('下載離線資料顯示筆數與時間', /上次下載：.*筆/.test(metaTxt), (metaTxt.match(/上次下載.*/)||[''])[0]);
  await shot('offline-02-download');

  // 3. 離線
  await ctx.setOffline(true);
  await wait(300);
  await page.goto(URL + '#/list');
  await page.waitForSelector('.grp');
  await page.click('.chip:has-text("全部")');
  await wait(800);
  await page.locator('.grp-hdr').first().click();
  await wait(500);
  const listTxt = await page.locator('main').innerText();
  check('離線清單有資料並提示離線', /離線中，顯示 .* 下載的資料/.test(listTxt));
  const offThumbs = await page.locator('.thumb.off').count();
  check('離線時縮圖顯示「離線」', offThumbs > 0, `${offThumbs} 張`);
  await shot('offline-03-list-offline');

  // 明細
  await page.locator('.row.defect').first().click();
  await page.waitForSelector('.pair');
  const pairTxt = await page.locator('.pair').innerText();
  check('明細照片顯示「離線中，照片需連線才能顯示」', pairTxt.includes('離線中，照片需連線才能顯示'));
  await shot('offline-04-detail-offline');

  // 4. 離線登記
  const img = await page.screenshot();
  await page.goto(URL + '#/register');
  await page.waitForSelector('form');
  await page.setInputFiles('input[type=file]', { name: 'p.png', mimeType: 'image/png', buffer: img });
  await page.waitForSelector('.photo-prev');
  await page.click('.chip:has-text("A")');
  await page.selectOption('select >> nth=0', '5F');
  await page.fill('input[autocapitalize=characters] >> nth=0', 'W9');
  await page.fill('textarea', '離線測試登記');
  await page.click('button:has-text("送出")');
  await page.waitForSelector('.toast');
  check('離線登記存到手機', (await page.locator('.toast').innerText()).includes('已存到手機'));

  // 讓這筆變成超過 24 小時（測醒目提醒）
  await page.evaluate(() => new Promise(res => {
    const r = indexedDB.open('defect-app');
    r.onsuccess = () => { const t = r.result.transaction('queue', 'readwrite'); const s = t.objectStore('queue'); s.getAll().onsuccess = e => { for (const it of e.target.result) { it.createdAt -= 25 * 3600e3; s.put(it); } }; t.oncomplete = res; };
  }));

  await page.goto(URL + '#/list');
  await page.click('.chip:has-text("未改善")');
  await wait(600);
  for (const h of await page.locator('.grp-hdr:has-text("5F")').all()) await h.click();
  await page.waitForSelector('.tag-pending');
  await page.locator('.tag-pending').first().scrollIntoViewIfNeeded();
  check('待上傳登記出現在清單', (await page.locator('.tag-pending').first().innerText()).includes('登記'));
  await shot('offline-05-list-pending');

  // 5. 離線改善（seed-DY-1 為未改善）
  await page.goto(URL + '#/fix/seed-DY-1');
  await page.waitForSelector('figure.ref');
  await page.setInputFiles('input[type=file]', { name: 'p.png', mimeType: 'image/png', buffer: img });
  await page.waitForSelector('.photo-prev');
  await page.click('button:has-text("送出改善")');
  await page.waitForSelector('.toast');
  check('離線改善存到手機', (await page.locator('.toast').innerText()).includes('已存到手機'));
  await wait(500);
  await page.goto(URL + '#/defect/seed-DY-1');
  await page.waitForSelector('.dhead');
  const dTxt = await page.locator('main').innerText();
  check('改善後該筆顯示待確認＋待上傳', dTxt.includes('待確認') && dTxt.includes('改善回報還在手機上'));
  check('超過 24 小時待上傳醒目提醒', await page.locator('.banner.alert').count() > 0);
  await shot('offline-06-detail-pending-fix');

  await page.goto(URL + '#/review');
  await wait(800);
  check('待確認頁含離線改善', (await page.locator('main').innerText()).includes('改善回報還在改善者手機上'));

  // 6. 離線統計
  await page.goto(URL + '#/stats');
  await page.waitForSelector('.asof', { timeout: 10000 });
  const asof = await page.locator('.asof').innerText();
  check('離線統計標示資料時間', /依 \d{4}\/\d{2}\/\d{2} \d{2}:\d{2} 的資料/.test(asof), asof);
  await shot('offline-07-stats-offline');

  // 7. 恢復網路 → 自動補送
  await ctx.setOffline(false);
  await page.goto(URL + '#/list');
  await page.click('.chip:has-text("全部")');
  await page.waitForFunction(() => !document.querySelector('.hdr .sync'), null, { timeout: 20000 }).catch(() => {});
  await wait(1500);
  await page.fill('input[type=search]', '離線測試登記');
  await wait(500);
  const syncLeft = await page.locator('.hdr .sync').count();
  check('恢復網路後自動補送完畢', syncLeft === 0);
  const rows = await page.locator('.row.defect').allInnerTexts();
  const mine = rows.filter(t => t.includes('離線測試登記'));
  check('補送後登記只出現一次且不再標待上傳', mine.length === 1 && !mine[0].includes('待上傳'), `${mine.length} 筆`);
  const thumbsOnline = await page.locator('.thumb.off').count();
  check('恢復網路後照片重新載入', thumbsOnline === 0, `仍離線 ${thumbsOnline}`);
  await shot('offline-08-back-online');

  // 8. 離線＋登入資料過期：不要求重新登入
  await page.evaluate(() => { const a = JSON.parse(localStorage.getItem('auth')); a.exp = Date.now() - 1000; localStorage.setItem('auth', JSON.stringify(a)); });
  await ctx.setOffline(true);
  await page.reload();
  await page.waitForSelector('.tabs, .login', { timeout: 15000 });
  check('離線時不因時間要求重新登入', await page.locator('.tabs').count() > 0);
  await ctx.setOffline(false);

  console.log(results.join('\n'));
  await browser.close();
})().catch(e => { console.log(results.join('\n')); console.error(e); process.exit(1); });
