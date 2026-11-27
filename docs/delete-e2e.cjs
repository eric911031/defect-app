// 刪除缺失 E2E（W5）：示範建置、iPhone 視窗。
// npm run build:demo && npx vite preview --outDir dist-demo --port 4173
// node docs/delete-e2e.cjs <截圖資料夾>
const { chromium, devices } = require('playwright');
const path = require('path');
const OUT = process.argv[2] || '.';
const BASE = 'http://localhost:4173/';
const results = [];
const check = (name, ok, extra = '') => results.push(`${ok ? 'PASS' : 'FAIL'} ${name}${extra ? ' — ' + extra : ''}`);

async function login(browser, email) {
  const ctx = await browser.newContext({ ...devices['iPhone 13'], deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  page.on('pageerror', e => results.push('PAGEERROR ' + e.message));
  await page.goto(BASE);
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
  return { ctx, page };
}

async function total(page) {
  const t = await page.locator('p.muted.small', { hasText: '筆' }).first().innerText();
  return +(t.match(/(\d+) 筆/) || [])[1];
}
async function firstDefect(page) {
  await page.goto(BASE + '#/list');
  await page.waitForSelector('.grp-hdr', { timeout: 15000 });
  const n = await total(page);
  const hdr = page.locator('.grp-hdr').first();
  if ((await hdr.innerText()).includes('▸')) await hdr.click();
  await page.locator('button.row.defect').first().click();
  await page.waitForSelector('.dhead');
  return { id: decodeURIComponent(page.url().split('#/defect/')[1]), n };
}

(async () => {
  const browser = await chromium.launch();
  // 管理者
  const { page } = await login(browser, 'admin@test');
  const { id, n } = await firstDefect(page);
  check('管理者明細頁有「刪除這筆」', await page.locator('text=刪除這筆').count() === 1);
  await page.screenshot({ path: path.join(OUT, 'del-01-detail.png') });
  // 取消 → 不刪
  page.once('dialog', d => d.dismiss());
  await page.click('text=刪除這筆');
  await page.waitForTimeout(500);
  check('按取消不會刪除', page.url().includes('#/defect/'));
  // 確定 → 刪除
  let msg = '';
  page.once('dialog', d => { msg = d.message(); d.accept(); });
  await page.click('text=刪除這筆');
  await page.waitForURL(/#\/list/, { timeout: 10000 });
  check('確認視窗說明會留在操作紀錄', msg.includes('操作紀錄'), msg.split('\n')[0]);
  await page.waitForTimeout(800);
  await page.waitForSelector('.grp-hdr');
  const n2 = await total(page);
  check('刪除後回清單、筆數少 1', n2 === n - 1, `${n} → ${n2}`);
  await page.screenshot({ path: path.join(OUT, 'del-02-list.png') });
  await page.goto(BASE + '#/defect/' + encodeURIComponent(id));
  await page.waitForTimeout(1500);
  check('再開明細顯示找不到', (await page.locator('.err').innerText().catch(() => '')).includes('找不到'));
  // 離線時不能刪
  const { id: id2 } = await firstDefect(page);
  await page.context().setOffline(true);
  await page.click('text=刪除這筆');
  await page.waitForTimeout(500);
  check('離線按刪除只提示、不刪', page.url().includes(encodeURIComponent(id2)) && (await page.locator('text=刪除需要網路').count()) > 0);
  await page.context().setOffline(false);
  // 登記者、改善者看不到
  for (const em of ['reg@test', 'fix@test']) {
    const { page: p } = await login(browser, em);
    await firstDefect(p);
    check(em + ' 明細頁沒有刪除按鈕', await p.locator('text=刪除這筆').count() === 0);
  }
  await browser.close();
  console.log(results.join('\n'));
  if (results.some(r => !r.startsWith('PASS'))) process.exit(1);
})();
