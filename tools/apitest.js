// Runs the site against a fake Apps Script API: hidden rows must vanish, edited texts must show, the POST must land.
const { chromium } = require('playwright');
const fs = require('fs'), vm = require('vm');
const ctx = { window: {} }; vm.createContext(ctx); vm.runInContext(fs.readFileSync('../assets/js/content.js', 'utf8'), ctx);
const D = JSON.parse(JSON.stringify(ctx.window.RIHLA_DEFAULTS));
const cfg = { ok: true, settings: { whatsapp_number: '966500000001', booking_url: 'https://calendar.app.google/test' }, texts: { hero_title_a: { ar: 'نص معدّل من الشيت…', en: 'Edited from the sheet…' } },
  universityTypes: D.universityTypes, universities: D.universities.filter(u => u.id !== 'monash'), majorGroups: D.majorGroups.filter(g => g.id !== 'law'), majors: D.majors.filter(m => m.group !== 'law'), options: D.options, team: D.team };
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=swiftshader'] });
  const p = await b.newPage({ viewport: { width: 1280, height: 860 } });
  let posted = null;
  await p.route('**/assets/js/config.js', r => r.fulfill({ contentType: 'application/javascript', body: "window.RIHLA_CONFIG={SHEET_API_URL:'https://script.google.com/macros/s/FAKE/exec'}" }));
  await p.route('https://script.google.com/**', r => {
    if (r.request().method() === 'POST') { posted = JSON.parse(r.request().postData()); return r.fulfill({ contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ ok: true, id: posted.lead_id, whatsapp: '966500000002' }) }); }
    r.fulfill({ contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(cfg) });
  });
  await p.addInitScript(() => { try { localStorage.clear(); } catch (e) {} });
  await p.goto('http://localhost:8822/', { waitUntil: 'networkidle' }); await p.waitForTimeout(1500);
  const hero = await p.textContent('.hl-a');
  const monashTab = await p.evaluate(() => { document.querySelector('[data-type="branch"]').click(); return document.querySelector('#typepanel').textContent.includes('Monash'); });
  await p.evaluate(() => document.getElementById('start').scrollIntoView());
  const c = async (s) => { await p.click(s); await p.waitForTimeout(150); };
  await c('[data-field="who"][data-id="student"]'); await c('[data-field="stage"][data-id="hs_grad"]'); await c('[data-next]');
  await c('[data-field="grades"][data-id="90p"]'); await c('[data-field="english"][data-id="ielts6"]'); await c('[data-next]');
  const lawGroup = await p.$('[data-group="law"]');
  await c('[data-group="health"]'); await c('[data-field="majors"][data-id="hl_med"]'); await c('[data-next]');
  await c('[data-field="uniTarget"][data-id="no"]'); await c('[data-next]');
  await c('[data-field="budget"][data-id="60p"]'); await c('[data-field="intake"][data-id="2027_02"]'); await c('[data-field="recognition"][data-id="yes"]'); await c('[data-next]');
  await p.fill('input[name="name"]', 'Test Student'); await p.fill('input[name="phone"]', '+971 50 123 4567'); await p.check('input[name="consent"]');
  await c('[data-next]'); await p.waitForTimeout(800);
  const book = await p.getAttribute('.success a[href*="calendar"]', 'href');
  const wa = await p.getAttribute('.success a[href*="wa.me"]', 'href');
  console.log(JSON.stringify({ hero, monashShown: monashTab, lawGroupShown: !!lawGroup, posted: posted && { phone: posted.phone, majors: posted.majors, intake: posted.intake, labels_majors: posted.labels.majors }, book, wa: wa && wa.slice(0, 40) }, null, 1));
  await b.close();
})();
