// ============================================================================
// ALEL Pulse — deterministic mock backend for UI audits & visual regression tests.
// Intercepts the Apps Script endpoint and serves generated data (60 items, 8 lines,
// 35 days) so UI checks run without touching production sheets or auth.
// ============================================================================
const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const pad = n => String(n).padStart(2, '0');
const fmt = d => MONTHS[d.getMonth()] + ' ' + pad(d.getDate()) + ', ' + d.getFullYear();

function buildMockData(seed = 1337, itemCount = 60) {
  let s = seed;
  const rnd = () => (s = (s * 1103515245 + 12345) % 2147483648) / 2147483648;

  const lines = ['LT-01','LT-02','LT-03','LT-04','LT-05','LT-06','LT-07','LT-08'];
  const sections = {
    'LT-01':'Switch Assembly','LT-02':'Switch Assembly','LT-03':'Switch Assembly',
    'LT-04':'Lighting Assembly','LT-05':'Lighting Assembly',
    'LT-06':'Fan Assembly','LT-07':'Fan Assembly','LT-08':'Fan Assembly'
  };
  const pgs = ['Wiring Devices','Lighting','Fan'];
  const names = ['SWITCH','LED BULB','EXHAUST FAN','PANEL LIGHT','CEILING FAN','MULTI SOCKET','BELL PUSH','HOLDER'];

  const items = [];
  for (let i = 0; i < itemCount; i++) {
    items.push({
      code: 'IT' + String(100 + i),
      name: 'ITEM ' + String(100 + i) + ' ' + names[i % 8],
      pg: pgs[Math.floor(i / 20) % 3],
      line: lines[i % 8],
    });
  }

  const times = ['08 AM - 09 AM','09 AM - 10 AM','10 AM - 11 AM','11 AM - 12 PM','12 PM - 01 PM','01 PM - 02 PM','02 PM - 03 PM','03 PM - 04 PM','04 PM - 05 PM','05 PM - 06 PM','06 PM - 07 PM','07 PM - 08 PM','08 PM - 09 PM','09 PM - 10 PM'];

  const rows = [];
  const today = new Date(); today.setHours(0,0,0,0);
  for (let d = 34; d >= 0; d--) {
    const date = new Date(today); date.setDate(date.getDate() - d);
    const dateStr = fmt(date);
    if (d > 5 && rnd() < 0.12) continue;
    items.forEach(it => {
      times.forEach(t => {
        if (rnd() < 0.3) return;
        const qty = Math.round(10 + rnd() * 190);
        const mp = 15 + Math.round(rnd() * 35);
        rows.push({
          date: dateStr, line: it.line, section: sections[it.line],
          item: it.name, itemCode: it.code, pg: it.pg, time: t,
          qty, mp,
          productivity: +((qty / mp) * (0.8 + rnd() * 0.5)).toFixed(1),
          targetProductivity: +(55 + rnd() * 25).toFixed(1),
        });
      });
    });
  }

  const defects = [];
  for (let d = 2; d >= 0; d--) {
    const date = new Date(today); date.setDate(date.getDate() - d);
    const dateStr = fmt(date);
    items.forEach(it => {
      times.forEach(t => {
        if (rnd() < 0.82) return;
        defects.push({ date: dateStr, line: it.line, item: it.name, itemCode: it.code, time: t, defectiveQty: 1 + Math.round(rnd() * 4), defectType: 'Soldering', rowIndex: defects.length });
      });
    });
  }
  const defectDates = [...new Set(defects.map(x => x.date))];

  return { items, lines, times, sections, pgs, rows, defects, defectDates };
}

async function installMockBackend(page, seed, itemCount) {
  const data = buildMockData(seed, itemCount);
  await page.route('**/script.google.com/macros/**/exec', async route => {
    const pd = route.request().postData() || '{}';
    let body = {}; try { body = JSON.parse(pd); } catch (e) {}
    const action = body.action;
    let resp = {};
    if (action === 'getData') {
      resp = { status: 'Success', authorizedEntry: true, authorizedDashboard: true, authorizedFPY: true,
        email: body.email, items: data.items.map(i => i.name), lines: data.lines, times: data.times,
        itemPgs: Object.fromEntries(data.items.map(i => [i.name, i.pg])),
        lineSections: data.sections,
        itemDefectCodes: Object.fromEntries(data.items.map(i => [i.name, 'D' + i.code])),
      };
    } else if (action === 'getProductionMetadata') {
      resp = { sections: [...new Set(Object.values(data.sections))], pgs: data.pgs,
        items: data.items.map(i => ({ label: '[' + i.code + '] - ' + i.name, pg: i.pg })),
        dates: [...new Set(data.rows.map(r => r.date))],
      };
    } else if (action === 'getDashboardRawData') {
      const sd = body.startDate ? new Date(body.startDate).getTime() : 0;
      const ed = body.endDate ? new Date(body.endDate).getTime() : 9e15;
      resp = { raw: data.rows.filter(r => { const t = new Date(r.date).getTime(); return t >= sd && t <= ed; }) };
    } else if (action === 'getDefectData') { resp = { rows: data.defects }; }
    else if (action === 'getDefectDates') { resp = { dates: data.defectDates }; }
    else if (action === 'getHourlyFPY') { resp = { rows: [] }; }
    else { resp = { status: 'Success' }; }
    await route.fulfill({ status: 200, contentType: 'application/json',
      headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify(resp) });
  });
  return data;
}

async function injectFakeAuth(page, email = 'head.plant@akijlightengineering.com') {
  const jwtPayload = { name: 'Audit Bot', email, picture: '', sub: '999000000000000000000', exp: Math.floor(Date.now()/1000) + 3600 };
  const fakeJwt = 'h.' + Buffer.from(JSON.stringify(jwtPayload)).toString('base64') + '.s';
  await page.evaluate(token => {
    localStorage.removeItem('alel_dash_snapshot');
    if (typeof openLogin === 'function') openLogin('dashboard');
    handleCredentialResponse({ credential: token });
  }, fakeJwt);
}

module.exports = { installMockBackend, injectFakeAuth, buildMockData };
