const { chromium } = require('playwright');
const { installMockBackend, injectFakeAuth } = require('/Users/mushfiq/Projects/alel-legacy-projects/ALEL_Production_Dashboard/tests/mock-backend');
(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: process.env.PW_EXEC });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await installMockBackend(page, 1337, 60);
  await page.goto('https://alelpulse.vercel.app/', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2500);
  await injectFakeAuth(page);
  await page.waitForTimeout(12000);
  await page.evaluate(() => { localStorage.setItem('alel_theme', 'dark'); applyTheme('dark'); });
  await page.waitForTimeout(1000);

  const tabs = [
    ['section', 'tab-section'], ['management', 'tab-management'], ['master', 'tab-master'],
    ['quality', 'tab-quality'], ['ai', 'tab-ai'],
  ];
  let failures = [];
  for (const [name, btnId] of tabs) {
    await page.evaluate(id => { const b = document.getElementById(id); if (b) b.click(); }, btnId);
    await page.waitForTimeout(2500);
    const res = await page.evaluate((tabName) => {
      const lum = (r, g, b) => {
        const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
        return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
      };
      const contrast = (c1, c2) => {
        const l1 = lum(c1[0], c1[1], c1[2]), l2 = lum(c2[0], c2[1], c2[2]);
        const [hi, lo] = l1 > l2 ? [l1, l2] : [l2, l1];
        return (hi + 0.05) / (lo + 0.05);
      };
      const parse = s => { const m = s.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/); return m ? [+m[1], +m[2], +m[3]] : null; };
      const effBg = el => {
        let e = el;
        while (e) {
          const bg = getComputedStyle(e).backgroundColor;
          const c = parse(bg);
          if (c && bg.includes(',') && !bg.endsWith('0, 0, 0, 0)') && !bg.includes('rgba(0, 0, 0, 0)')) {
            const a = parse(bg); const alpha = bg.includes('rgba') ? +(bg.split(',')[3] || '1') : 1;
            if (alpha > 0.1) return c;
          }
          e = e.parentElement;
        }
        return [11, 18, 32];
      };
      const view = document.querySelector('#view-' + tabName.replace('section', 'section'));
      const els = view ? view.querySelectorAll('h1,h2,h3,p,span,td,th,button,a,label,div') : [];
      const bad = [];
      let checked = 0;
      els.forEach(el => {
        if (el.children.length > 0) return;
        const txt = (el.textContent || '').trim();
        if (!txt || txt.length > 60) return;
        const cs = getComputedStyle(el);
        if (cs.display === 'none' || cs.visibility === 'hidden') return;
        const rect = el.getBoundingClientRect();
        if (rect.width < 4 || rect.height < 4) return;
        const fg = parse(cs.color); if (!fg) return;
        if (cs.opacity === '0') return;
        const bg = effBg(el);
        const ratio = contrast(fg, bg);
        checked++;
        if (ratio < 3.0) bad.push({ txt: txt.substring(0, 32), ratio: +ratio.toFixed(2), fg: cs.color.substring(0, 20), cls: (el.className || '').toString().substring(0, 40) });
      });
      return { tab: tabName, checked, bad: bad.slice(0, 15) };
    }, name);
    console.log(`TAB ${name}: checked ${res.checked} texts, ${res.bad.length} low-contrast (showing ≤15)`);
    res.bad.forEach(b => console.log(`   FAIL ${b.ratio}  "${b.txt}"  fg=${b.fg}  [${b.cls}]`));
    failures.push(...res.bad);
  }
  // hover fix verification
  const hover = await page.evaluate(async () => {
    const tb = document.getElementById('summary-item-table');
    const row = tb.querySelector('tr');
    row.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    await new Promise(r => setTimeout(r, 200));
    return getComputedStyle(row).backgroundColor;
  });
  console.log('hovered row bg (dark):', hover, hover.includes('51, 65, 85') ? '=> FIX OK' : '=> STILL WHITE?');
  await browser.close();
  console.log('\ntotal low-contrast texts:', failures.length);
  process.exit(failures.length ? 1 : 0);
})();
