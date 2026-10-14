// ============================================================================
// ALEL Pulse — UI audit / visual regression checks (mock backend, deterministic).
// Run:  node tests/ui-audit.js [TARGET_URL]
// Default TARGET_URL: https://alelpulse.vercel.app/
// Checks: table visibility at 3 viewports, sticky-header opacity while scrolling,
//         mobile filter-bar wrap, horizontal overflow, app console errors.
// ============================================================================
const { chromium } = require('playwright');
const { installMockBackend, injectFakeAuth } = require('./mock-backend');

const TARGET = process.argv[2] || 'https://alelpulse.vercel.app/';
const results = [];
const check = (name, pass, detail) => { results.push({ name, pass, detail: detail || '' }); console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`); };

(async () => {
  const fs = require('fs');
  const path = require('path');
  const os = require('os');
  function findChromium() {
    const roots = [process.env.PW_EXEC, process.env.PLAYWRIGHT_EXECUTABLE].filter(Boolean);
    if (roots.length) return roots[0];
    const bases = [path.join(os.homedir(), 'Library/Caches/ms-playwright'), path.join(os.homedir(), '.cache/ms-playwright')];
    const candidates = [];
    for (const base of bases) {
      if (!fs.existsSync(base)) continue;
      for (const d of fs.readdirSync(base).filter(x => x.startsWith('chromium-') && !x.startsWith('chromium_headless'))) {
        const subs = ['chrome-mac', 'chrome-mac-arm64', 'chrome-linux', 'chrome-linux64'];
        const appNames = ['Chromium', 'Google Chrome for Testing'];
        for (const sub of subs) for (const app of appNames) {
          candidates.push(path.join(base, d, sub, app + '.app', 'Contents', 'MacOS', app));
          candidates.push(path.join(base, d, sub, app));
        }
      }
    }
    return candidates.find(p => fs.existsSync(p)) || null;
  }
  let browser;
  try {
    browser = await chromium.launch({ headless: true });
  } catch (e) {
    const exe = findChromium();
    if (!exe) throw e;
    browser = await chromium.launch({ headless: true, executablePath: exe });
  }
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const appErrors = [];
  page.on('console', msg => {
    if (msg.type() === 'error') {
      const t = msg.text();
      if (!t.includes('play.google.com') && !t.includes('favicon') && !t.includes('Failed to load resource')) appErrors.push(t);
    }
  });
  const badResponses = [];
  page.on('response', res => {
    if (res.status() === 404) {
      const u = res.url();
      if (!u.includes('favicon')) badResponses.push(u.split('?')[0]);
    }
  });

  await installMockBackend(page, 1337, 60);
  await page.goto(TARGET, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(2500);
  await injectFakeAuth(page);
  await page.waitForTimeout(12000);

  const tableH = () => page.evaluate(() => {
    const tb = document.getElementById('summary-item-table');
    const cont = tb ? tb.closest('.overflow-y-auto') : null;
    return cont ? Math.round(cont.getBoundingClientRect().height) : -1;
  });

  // --- 1. Summary table visible at three viewports ---
  for (const [w, h] of [[1440, 900], [1028, 742], [390, 844]]) {
    await page.setViewportSize({ width: w, height: h });
    await page.waitForTimeout(1200);
    await page.evaluate(() => { const b = document.getElementById('tab-management'); if (b) b.click(); });
    await page.waitForTimeout(1500);
    const hgt = await tableH();
    check(`summary table visible @${w}x${h}`, hgt >= 200, `container height ${hgt}px`);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    check(`no horizontal page overflow @${w}`, !overflow);
  }

  // --- 2. Sticky header opacity (screenshot pixel forensics) ---
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.waitForTimeout(1200);
  await page.evaluate(() => { const b = document.getElementById('tab-management'); if (b) b.click(); });
  await page.waitForTimeout(1500);
  const headerDiff = await page.evaluate(async () => {
    return null;
  });
  {
    const stripShot = async st => {
      await page.evaluate(s => { document.getElementById('summary-item-table').closest('.overflow-y-auto').scrollTop = s; }, st);
      await page.waitForTimeout(400);
      const rect = await page.evaluate(() => {
        const b = document.getElementById('summary-item-table').closest('.overflow-y-auto').getBoundingClientRect();
        return { x: b.x, y: b.y, width: b.width, height: b.height };
      });
      return await page.screenshot({ clip: { x: rect.x, y: rect.y, width: rect.width - 24, height: 38 } });
    };
    const a = await stripShot(0);
    const b = await stripShot(600);
    check('sticky header fully opaque while scrolling', Buffer.compare(a, b) === 0,
      Buffer.compare(a, b) === 0 ? 'header strip pixel-identical' : 'header strip pixels CHANGED while scrolling (see-through)');
  }

  // --- 3. Quality table visible at medium viewport ---
  await page.setViewportSize({ width: 1028, height: 742 });
  await page.waitForTimeout(1000);
  await page.evaluate(() => { const b = document.getElementById('tab-quality'); if (b) b.click(); });
  await page.waitForTimeout(2500);
  const qH = await page.evaluate(() => {
    const tb = document.getElementById('quality-table');
    const cont = tb ? tb.closest('.overflow-y-auto') : null;
    return cont ? Math.round(cont.getBoundingClientRect().height) : -1;
  });
  check('quality table visible @1028x742', qH >= 200, `container height ${qH}px`);

  // --- 4. Mobile filter bar wraps ≤ 2 rows ---
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(1000);
  await page.evaluate(() => { const b = document.getElementById('tab-management'); if (b) b.click(); });
  await page.waitForTimeout(1500);
  const wraps = await page.evaluate(() => {
    const bar = document.querySelector('#view-management .border-b');
    if (!bar) return -1;
    const kids = Array.from(bar.children).map(k => k.getBoundingClientRect());
    let rows = 1, prevTop = kids.length ? kids[0].top : 0;
    kids.forEach(k => { if (Math.abs(k.top - prevTop) > 5) { rows++; prevTop = k.top; } });
    return rows;
  });
  check('mobile filter bar ≤ 2 rows', wraps <= 2 && wraps > 0, `${wraps} row(s)`);

  // --- 5. No app console errors ---
  check('no unexpected console errors', appErrors.length === 0, appErrors.slice(0, 3).join(' | '));
  check('no unexpected 404 resources', badResponses.length === 0, badResponses.slice(0, 3).join(' | '));

  await browser.close();
  const failed = results.filter(r => !r.pass).length;
  console.log(`\n${results.length - failed}/${results.length} checks passed`);
  process.exit(failed ? 1 : 0);
})();
