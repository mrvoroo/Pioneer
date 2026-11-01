// Every site function and the lead form, against a fake Apps Script API, in both languages.
const { chromium } = require('playwright');
const fs = require('fs'), vm = require('vm');
const ctxv = { window: {} }; vm.createContext(ctxv); vm.runInContext(fs.readFileSync(require('path').join(__dirname, '../../assets/js/content.js'), 'utf8'), ctxv);
const D = JSON.parse(JSON.stringify(ctxv.window.RIHLA_DEFAULTS));
const URL = (process.env.SITE_URL || 'http://localhost:8080/');
const API = 'https://script.google.com/macros/s/FAKE/exec';
const fails = []; let checks = 0;
const ok = (c, m) => { checks++; if (!c) fails.push(m); };

async function open(b, { lang = 'ar', api = true, cfg = null, post = 'ok', w = 1280, h = 860, query = '', keep = false } = {}) {
  const ctx = await b.newContext({ viewport: { width: w, height: h } });
  const p = await ctx.newPage();
  p.errs = []; p.posts = [];
  p.on('pageerror', e => p.errs.push(e.message));
  p.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|THREE/.test(m.text())) p.errs.push(m.text()); });
  await p.route('**/assets/js/config.js', r => r.fulfill({ contentType: 'application/javascript', body: `window.RIHLA_CONFIG={SHEET_API_URL:'${api ? API : ''}'}` }));
  await p.route('https://script.google.com/**', async r => {
    const req = r.request();
    if (req.method() === 'POST') {
      p.posts.push(JSON.parse(req.postData()));
      const mode = typeof p.postMode === 'string' ? p.postMode : post;
      if (mode === 'fail') return r.abort('failed');
      if (mode === 'error') return r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ ok: false, error: 'invalid' }) });
      if (mode === 'slow') await new Promise(res => setTimeout(res, 1500));
      const last = p.posts[p.posts.length - 1];
      return r.fulfill({ contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ ok: true, id: last.lead_id, whatsapp: '966500000002' }) });
    }
    if (p.cfgMode === 'hang') return; // never answer
    r.fulfill({ contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(cfg || { ok: true, settings: {}, texts: {} }) });
  });
  await p.addInitScript(([l, keep]) => { try { if (!keep && !sessionStorage.t) { localStorage.clear(); sessionStorage.t = 1; } localStorage.setItem('rihla_lang', JSON.stringify(l)); } catch (e) {} }, [lang, keep]);
  await p.goto(URL + query, { waitUntil: 'domcontentloaded' });
  await p.waitForSelector('#leadform .step', { timeout: 15000 });
  await p.waitForTimeout(400);
  return p;
}
const c = async (p, s) => { await p.click(s); await p.waitForTimeout(80); };
const err = (p) => p.textContent('#ferr');
const step = (p) => p.evaluate(() => Number(document.querySelector('#leadform .step')?.dataset.step ?? -1));
async function toForm(p) { await p.evaluate(() => document.getElementById('start').scrollIntoView()); await p.waitForTimeout(150); }
async function fillTo(p, n, o = {}) {
  if (n >= 1) { await c(p, `[data-field="who"][data-id="${o.who || 'student'}"]`); await c(p, '[data-field="stage"][data-id="g12"]'); await c(p, '[data-field="system"][data-id="american"]'); await c(p, '[data-next]'); }
  if (n >= 2) { await c(p, '[data-field="grades"][data-id="80_89"]'); await c(p, '[data-field="english"][data-id="good"]'); await c(p, '[data-next]'); }
  if (n >= 3) { if (o.notSure) await c(p, '[data-field="notSure"]'); else { await c(p, '[data-group="eng"]'); await c(p, '[data-field="majors"][data-id="eng_mech"]'); } await c(p, '[data-next]'); }
  if (n >= 4) { await c(p, `[data-field="uniTarget"][data-id="${o.uni || 'yes'}"]`); if ((o.uni || 'yes') === 'yes') { await c(p, '[data-field="unis"][data-id="utm"]'); await c(p, '[data-field="unis"][data-id="monash"]'); } await c(p, '[data-next]'); }
  if (n >= 5) { await c(p, '[data-field="budget"][data-id="20_35"]'); await c(p, '[data-field="intake"][data-id="2027_09"]'); await c(p, '[data-field="recognition"][data-id="yes"]'); await c(p, '[data-next]'); }
}
async function contact(p, { name = 'Sara Ahmed', phone = '0512345678', email = '', consent = true } = {}) {
  await p.fill('input[name="name"]', name); await p.fill('input[name="phone"]', phone);
  if (email) await p.fill('input[name="email"]', email);
  if (consent) await p.check('input[name="consent"]');
}

(async () => {
  const b = await chromium.launch({ args: ['--use-gl=swiftshader'] });
  for (const lang of ['ar', 'en']) {
    const L = (s) => `[${lang}] ${s}`;
    // A0. Labels the user asked for.
    { const pp = await open(b, { lang }); const gl = await pp.textContent('[data-field="who"][data-id="graduate"]'); ok(lang === 'ar' ? gl.trim() === 'الدراسات العليا' : gl.trim() === 'Postgraduate studies', L('graduate option label: ' + gl)); await pp.context().close(); }
    // A. Required answers on every step.
    let p = await open(b, { lang }); await toForm(p);
    await c(p, '[data-next]'); ok((await err(p)).length > 3 && await step(p) === 0, L('step 0 advances without answers'));
    await c(p, '[data-field="who"][data-id="student"]'); ok((await err(p)) === '', L('error not cleared after answering'));
    await c(p, '[data-next]'); ok(await step(p) === 0, L('step 0 advances with only one answer'));
    // High-school system: only asked for school stages, required when asked, cleared for other stages.
    await c(p, '[data-field="stage"][data-id="bachelor"]');
    ok(!(await p.$('[data-field="system"]')), L('system question shown for a bachelor holder'));
    await c(p, '[data-field="stage"][data-id="g12"]');
    ok(!!(await p.$('[data-field="system"][data-id="ib"]')), L('system question missing for grade 12'));
    await c(p, '[data-next]'); ok(await step(p) === 0, L('step 0 advances without the high-school system'));
    await c(p, '[data-field="system"][data-id="american"]');
    await c(p, '[data-next]'); ok(await step(p) === 1, L('step 0 does not advance with stage + system'));
    await c(p, '[data-back]');
    await fillTo(p, 1);
    await c(p, '[data-next]'); ok(await step(p) === 1, L('step 1 advances empty'));
    ok(await p.getAttribute('[data-field="degree"][data-id="bachelor"]', 'aria-pressed') === 'true', L('degree not pre-selected from stage'));
    await c(p, '[data-field="grades"][data-id="80_89"]'); await c(p, '[data-field="english"][data-id="good"]'); await c(p, '[data-next]');
    await c(p, '[data-next]'); ok(await step(p) === 2, L('majors step advances with nothing chosen'));
    await c(p, '[data-group="eng"]'); await c(p, '[data-next]'); ok(await step(p) === 2, L('majors step advances with a field but no major'));
    await c(p, '[data-field="majors"][data-id="eng_mech"]'); await c(p, '[data-next]');
    await c(p, '[data-next]'); ok(await step(p) === 3, L('uni step advances empty'));
    await c(p, '[data-field="uniTarget"][data-id="yes"]'); await c(p, '[data-next]'); ok(await step(p) === 3, L('uni step advances with yes but none chosen'));
    // search: no match hides every group; clearing brings them back
    await p.fill('#unisearch', 'zzzz'); await p.waitForTimeout(100);
    ok(await p.evaluate(() => [...document.querySelectorAll('.subchips[data-type]')].every(g => g.hidden)), L('empty search leaves empty groups'));
    await p.fill('#unisearch', 'monash'); await p.waitForTimeout(100);
    ok(await p.evaluate(() => [...document.querySelectorAll('[data-search]')].filter(e => !e.hidden).length) === 1, L('search monash not exactly 1'));
    await p.fill('#unisearch', ''); await p.waitForTimeout(100);
    ok(await p.evaluate(() => [...document.querySelectorAll('[data-search]')].every(e => !e.hidden)), L('clearing search does not restore'));
    await c(p, '[data-field="unis"][data-id="utm"]'); await c(p, '[data-field="uniTarget"][data-id="no"]');
    ok(await p.evaluate(() => JSON.parse(localStorage.rihla_form).unis.length) === 0, L('switching to "no" keeps old universities'));
    await c(p, '[data-next]');
    await c(p, '[data-next]'); ok(await step(p) === 4, L('budget step advances empty'));
    // B. Back keeps answers.
    await c(p, '[data-back]'); await c(p, '[data-back]');
    ok(await step(p) === 2 && await p.getAttribute('[data-field="majors"][data-id="eng_mech"]', 'aria-pressed') === 'true', L('back loses majors'));
    // C. Reload restores the draft.
    await p.reload({ waitUntil: 'domcontentloaded' }); await p.waitForSelector('#leadform .step'); await p.waitForTimeout(300);
    ok(await step(p) === 2 && await p.getAttribute('[data-group="eng"]', 'aria-pressed') === 'true', L('reload does not restore the draft'));
    // D. Language switch mid-form keeps step and answers.
    await toForm(p); await c(p, '[data-lang]');
    ok(await step(p) === 2 && await p.getAttribute('[data-field="majors"][data-id="eng_mech"]', 'aria-pressed') === 'true', L('language switch loses form state'));
    const legend = await p.textContent('#leadform legend');
    ok(lang === 'ar' ? /[A-Za-z]/.test(legend) : /[؀-ۿ]/.test(legend), L('form text not translated after switch: ' + legend));
    await c(p, '[data-lang]');
    await p.context().close();

    // E. Contact-step validation and phone formats.
    p = await open(b, { lang }); await toForm(p); await fillTo(p, 5, { who: 'parent' });
    ok(await p.isVisible('input[name="studentName"]'), L('parent: no student-name field'));
    await c(p, '[data-next]'); ok(await step(p) === 5 && (await err(p)).length > 3, L('submits with empty contact'));
    await p.fill('input[name="name"]', '   '); await p.fill('input[name="phone"]', '0512345678'); await p.check('input[name="consent"]'); await c(p, '[data-next]');
    ok(p.posts.length === 0, L('whitespace name accepted'));
    await p.fill('input[name="name"]', 'Ali');
    for (const [ph, good] of [['05123', false], ['abc', false], ['0612345678', false], ['0512345678', true], ['512345678', true], ['+966 51 234 5678', true], ['00966512345678', true], ['+44 7911 123456', true]]) {
      const res = await p.evaluate((ph) => { const i = document.querySelector('input[name="phone"]'); i.value = ph; i.dispatchEvent(new Event('input', { bubbles: true })); return true; }, ph);
      const accepted = await p.evaluate(() => { const before = document.querySelector('#ferr').textContent; return before; });
      // validate through the real path without sending: uncheck consent so a valid phone stops at the consent check
      await p.uncheck('input[name="consent"]'); await c(p, '[data-next]');
      const e = await err(p);
      const phoneErr = /0512345678/.test(e);
      ok(phoneErr === !good, L(`phone "${ph}" ${good ? 'rejected' : 'accepted'} (${e})`));
    }
    await p.fill('input[name="phone"]', '0512345678'); await p.fill('input[name="email"]', 'a@b'); await p.check('input[name="consent"]'); await c(p, '[data-next]');
    ok(p.posts.length === 0 && /@|mail|البريد/.test(await err(p)), L('bad email accepted'));
    await p.fill('input[name="email"]', '');
    await p.uncheck('input[name="waSame"]'); await p.waitForTimeout(100);
    ok(await p.isVisible('input[name="whatsapp"]'), L('whatsapp field missing when unticked'));
    await p.fill('input[name="whatsapp"]', '123'); await c(p, '[data-next]'); ok(p.posts.length === 0, L('bad whatsapp accepted'));
    await p.fill('input[name="whatsapp"]', '0555555555');
    await p.fill('input[name="name"]', '<img src=x onerror="window.__x=1">Ali');
    // F. Double submit sends once.
    p.postMode = 'slow';
    await p.evaluate(() => { const b = document.querySelector('[data-next]'); b.click(); b.click(); document.getElementById('leadform').requestSubmit(); });
    await p.waitForSelector('.success', { timeout: 8000 });
    ok(p.posts.length === 1, L(`double submit sent ${p.posts.length} posts`));
    const post = p.posts[0];
    ok(post.phone === '966512345678' && post.whatsapp === '966555555555' && post.who === 'parent', L('payload phone/whatsapp/who wrong: ' + JSON.stringify([post.phone, post.whatsapp, post.who])));
    ok(post.universities.length === 2 && post.majors[0] === 'eng_mech' && post.labels && post.labels.majors, L('payload choices wrong'));
    ok(post.curriculum === 'american' && /American/.test(post.labels.curriculum), L('curriculum not sent: ' + post.curriculum));
    ok(await p.evaluate(() => !window.__x && !document.querySelector('.success img')), L('name HTML was injected'));
    ok((await p.getAttribute('.success a[href*="wa.me"]', 'href')).includes('966500000002'), L('success WhatsApp not routed to assigned consultant'));
    await p.reload({ waitUntil: 'domcontentloaded' }); await p.waitForSelector('#leadform .step'); await p.waitForTimeout(300);
    ok(await step(p) === 0 && await p.getAttribute('[data-field="who"][data-id="parent"]', 'aria-pressed') === 'false', L('form not reset after success'));
    ok(!p.errs.length, L('errors: ' + p.errs.join(' | ')));
    await p.context().close();

    // G. API failure → WhatsApp fallback, then retry succeeds with the same id.
    p = await open(b, { lang, post: 'fail' }); await toForm(p); await fillTo(p, 5, { notSure: true, uni: 'no' }); await contact(p);
    await c(p, '[data-next]'); await p.waitForTimeout(600);
    const fb = await p.getAttribute('#ferr a[href*="wa.me"]', 'href');
    ok(fb && decodeURIComponent(fb).includes(p.posts[0].lead_id), L('no WhatsApp fallback with request id on failure'));
    ok(await p.isEnabled('[data-next]'), L('submit stays disabled after failure'));
    ok(p.posts[0].majors[0] === 'not_sure' && p.posts[0].universities.length === 0, L('not-sure / no-university payload wrong'));
    p.postMode = 'ok'; await c(p, '[data-next]'); await p.waitForSelector('.success', { timeout: 5000 });
    ok(p.posts.length === 2 && p.posts[1].lead_id === p.posts[0].lead_id, L('retry did not reuse the same request id'));
    await p.context().close();
    p = await open(b, { lang, post: 'error' }); await toForm(p); await fillTo(p, 5); await contact(p);
    await c(p, '[data-next]'); await p.waitForTimeout(500);
    ok(!(await p.isVisible('.success')) && (await err(p)).length > 5, L('API ok:false shown as success'));
    await p.context().close();

    // H. Preview mode (no API) and booking button from the sheet.
    p = await open(b, { lang, api: false }); await toForm(p); await fillTo(p, 5); await contact(p); await c(p, '[data-next]');
    await p.waitForSelector('.success'); ok(await p.isVisible('.note--warn') && p.posts.length === 0, L('preview mode not flagged'));
    ok(!(await p.$('.success a[href*="calendar"]')), L('booking button shown without booking_url'));
    await p.context().close();
    const cfg = { ok: true, settings: { booking_url: 'https://calendar.app.google/x', meta_pixel_id: '123' }, texts: {}, universities: D.universities.filter(u => u.id !== 'monash'), universityTypes: D.universityTypes, majorGroups: D.majorGroups, majors: D.majors, options: D.options, team: D.team };
    p = await open(b, { lang, cfg, query: '?utm_source=snap&utm_campaign=sep27&ref=ahmad' }); await toForm(p);
    // I. Consent bar: nothing loads before consent.
    ok(await p.isVisible('#consent'), L('consent bar missing with a pixel id'));
    ok(!(await p.evaluate(() => !!document.querySelector('script[src*="fbevents"]'))), L('pixel loaded before consent'));
    await c(p, '#consent [data-c="yes"]');
    ok(await p.evaluate(() => !!document.querySelector('script[src*="fbevents"]')), L('pixel not loaded after consent'));
    // J. Stale draft pointing at a hidden university is cleaned.
    await p.evaluate(() => { const f = JSON.parse(localStorage.rihla_form || '{}'); Object.assign(f, { step: 3, who: 'student', stage: 'g12', degree: 'bachelor', grades: '80_89', english: 'good', groups: ['eng'], majors: ['eng_mech'], uniTarget: 'yes', unis: ['monash', 'utm'] }); localStorage.rihla_form = JSON.stringify(f); });
    await p.reload({ waitUntil: 'domcontentloaded' }); await p.waitForSelector('#leadform .step'); await p.waitForTimeout(300);
    ok(await p.evaluate(() => !document.querySelector('[data-id="monash"]')), L('hidden university still offered'));
    await toForm(p); await c(p, '[data-next]'); await fillTo(p, 0); await c(p, '[data-field="budget"][data-id="20_35"]'); await c(p, '[data-field="intake"][data-id="2027_09"]'); await c(p, '[data-field="recognition"][data-id="yes"]'); await c(p, '[data-next]');
    await contact(p); await c(p, '[data-next]'); await p.waitForSelector('.success');
    const last = p.posts[p.posts.length - 1];
    ok(last.universities.join() === 'utm', L('hidden university sent: ' + last.universities));
    ok(last.utm_source === 'snap' && last.utm_campaign === 'sep27' && last.ref === 'ahmad', L('tracking params not sent'));
    ok(await p.isVisible('.success a[href*="calendar"]'), L('booking button missing with booking_url'));
    await p.reload({ waitUntil: 'domcontentloaded' }); await p.waitForTimeout(500);
    ok(!(await p.isVisible('#consent')), L('consent asked again after accepting'));
    await p.context().close();

    // K. Config API hangs: page still comes up quickly with defaults.
    const t0 = Date.now();
    const ctxH = await b.newContext({ viewport: { width: 1280, height: 860 } }); const ph = await ctxH.newPage();
    await ph.route('**/assets/js/config.js', r => r.fulfill({ contentType: 'application/javascript', body: `window.RIHLA_CONFIG={SHEET_API_URL:'${API}'}` }));
    await ph.route('https://script.google.com/**', () => {});
    await ph.addInitScript((l) => { try { localStorage.clear(); localStorage.setItem('rihla_lang', JSON.stringify(l)); } catch (e) {} }, lang);
    await ph.goto(URL, { waitUntil: 'domcontentloaded' }); await ph.waitForSelector('#leadform .step', { timeout: 10000 });
    ok(Date.now() - t0 < 6000, L(`hung config delays page ${Date.now() - t0}ms`));
    await ctxH.close();

    // L. Page features: tabs, privacy dialog, nav, mobile CTA.
    p = await open(b, { lang });
    for (const ty of ['public', 'glc', 'private', 'branch']) {
      await p.evaluate((ty) => document.querySelector(`[data-type="${ty}"]`).click(), ty);
      const shown = await p.evaluate(() => [...document.querySelectorAll('#typepanel .unis li')].map(li => li.firstChild.textContent));
      const want = D.universities.filter(u => u.type === ty).map(u => u.short);
      ok(JSON.stringify(shown) === JSON.stringify(want), L(`type tab ${ty} shows ${shown}`));
    }
    await p.evaluate(() => document.querySelector('.site-footer [data-privacy]').click()); await p.waitForTimeout(150);
    ok(await p.evaluate(() => document.getElementById('privacy').open), L('privacy dialog does not open from footer'));
    await p.keyboard.press('Escape'); await p.waitForTimeout(150);
    ok(!(await p.evaluate(() => document.getElementById('privacy').open)), L('privacy dialog does not close on Escape'));
    await toForm(p); await fillTo(p, 5); await p.evaluate(() => document.querySelector('#leadform [data-privacy]').click()); await p.waitForTimeout(150);
    ok(await p.evaluate(() => document.getElementById('privacy').open), L('privacy dialog does not open from form'));
    await p.click('#privacy [data-close]'); await p.waitForTimeout(150);
    ok(!(await p.evaluate(() => document.getElementById('privacy').open)), L('privacy close button'));
    ok(await step(p) === 5, L('privacy link changed form step'));
    await p.click('.nav a[href="#parents"]'); await p.waitForTimeout(1200);
    ok(await p.evaluate(() => window.__rihla.scene()) === 'parents', L('nav link to parents'));
    await p.context().close();
    p = await open(b, { lang, w: 390, h: 844 });
    await p.evaluate(() => scrollTo(0, 0)); await p.waitForTimeout(400);
    const ctaTop = await p.evaluate(() => document.getElementById('mobile-cta').classList.contains('show'));
    await p.evaluate(() => document.getElementById('s3').scrollIntoView({ behavior: 'instant' })); await p.waitForTimeout(400);
    const ctaMid = await p.evaluate(() => document.getElementById('mobile-cta').classList.contains('show'));
    await p.evaluate(() => document.getElementById('start').scrollIntoView({ behavior: 'instant' })); await p.waitForTimeout(400);
    const ctaForm = await p.evaluate(() => document.getElementById('mobile-cta').classList.contains('show'));
    ok(!ctaTop && ctaMid && !ctaForm, L(`mobile CTA top=${ctaTop} mid=${ctaMid} form=${ctaForm}`));
    const overflow = await p.evaluate(() => document.documentElement.scrollWidth - innerWidth);
    ok(overflow <= 0, L(`horizontal scroll on phone: ${overflow}px`));
    await p.context().close();
  }
  await b.close();
  console.log(`checks: ${checks}, failures: ${fails.length}`);
  console.log(fails.join('\n'));
})();
