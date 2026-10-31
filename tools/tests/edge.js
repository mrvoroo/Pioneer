// Edge cases around the 3D story: language switching mid-scene, reloads, hash links, resizing,
// reduced motion, no WebGL, car direction, frantic scrolling, tab hidden/visible.
const { chromium } = require('playwright');
const EXPECT = { hero: 'towers', s1: 'school', s2: 'car', s3: 'office', s4: 'globe', s5: 'campus', s6: 'cap', parents: 'shield', team: 'sky', start: 'sky' };
const IDS = Object.keys(EXPECT);
const URL = (process.env.SITE_URL || 'http://localhost:8080/');
const fails = []; let checks = 0;
const ok = (cond, msg) => { checks++; if (!cond) fails.push(msg); };
async function page(b, { lang = 'ar', w = 1440, h = 900, reduced = false } = {}) {
  const ctx = await b.newContext({ viewport: { width: w, height: h }, reducedMotion: reduced ? 'reduce' : 'no-preference' });
  const p = await ctx.newPage();
  p.errs = []; p.on('pageerror', e => p.errs.push(e.message)); p.on('console', m => { if (m.type() === 'error' && !m.text().startsWith('THREE.WebGLRenderer')) p.errs.push(m.text()); });
  await p.addInitScript((l) => { try { if (!sessionStorage.getItem('t')) { localStorage.clear(); localStorage.setItem('rihla_lang', JSON.stringify(l)); sessionStorage.setItem('t', '1'); } } catch (e) {} }, lang);
  return p;
}
const state = (p) => p.evaluate(() => ({ scene: window.__rihla.scene(), lang: window.__rihla.lang(), dbg: window.__rihla.debug(), dir: document.documentElement.dir, centre: (() => { const y = innerHeight / 2; const el = [...document.querySelectorAll('section[data-scene]')].find(e => { const r = e.getBoundingClientRect(); return r.top <= y && r.bottom > y; }); return el && el.id; })() }));
const goTo = (p, id) => p.evaluate((id) => document.getElementById(id).scrollIntoView({ block: 'center' }), id);
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] });

  // 1. Switch language while sitting on each section, both directions, desktop and phone.
  for (const [w, h] of [[1440, 900], [390, 844]]) for (const start of ['ar', 'en']) {
    const p = await page(b, { lang: start, w, h });
    await p.goto(URL, { waitUntil: 'networkidle' }); await p.waitForTimeout(800);
    for (const id of IDS) {
      await goTo(p, id); await p.waitForTimeout(250);
      for (let k = 0; k < 2; k++) {
        await p.click('[data-lang]'); await p.waitForTimeout(300);
        const s = await state(p);
        const want = k === 0 ? (start === 'ar' ? 'en' : 'ar') : start;
        ok(s.lang === want && s.dir === (want === 'ar' ? 'rtl' : 'ltr'), `${w} ${start} toggle#${k} on ${id}: lang=${s.lang} dir=${s.dir}`);
        ok(s.centre === id, `${w} ${start} toggle#${k} on ${id}: landed on ${s.centre}`);
        ok(s.scene === s.centre && s.dbg.shape === EXPECT[s.centre], `${w} ${start} toggle#${k} on ${id}: scene=${s.scene} shape=${s.dbg.shape}`);
        if (w > 860 && !['team', 'start'].includes(id)) ok(Math.sign(s.dbg.goal.x) === (want === 'ar' ? -1 : 1), `${w} ${start} toggle#${k} on ${id}: shape on wrong side x=${s.dbg.goal.x}`);
      }
    }
    const nTriggers = await p.evaluate(() => window.ScrollTrigger.getAll().length);
    for (let k = 0; k < 6; k++) { await p.click('[data-lang]'); await p.waitForTimeout(120); }
    ok(await p.evaluate(() => window.ScrollTrigger.getAll().length) === nTriggers, `${w} ${start}: scroll triggers pile up after toggling`);
    ok(!p.errs.length, `${w} ${start} toggling errors: ${p.errs.join(' | ')}`);
    await p.context().close();
  }

  // 2. Hash links and reload in the middle of the page.
  for (const lang of ['ar', 'en']) {
    for (const id of ['s4', 'parents', 'start']) {
      const p = await page(b, { lang });
      await p.goto(URL + '#' + id, { waitUntil: 'networkidle' }); await p.waitForTimeout(900);
      const s = await state(p);
      ok(s.scene === s.centre && s.dbg.shape === EXPECT[s.centre], `${lang} #${id}: centre=${s.centre} scene=${s.scene} shape=${s.dbg.shape}`);
      await goTo(p, 's5'); await p.waitForTimeout(300);
      await p.reload({ waitUntil: 'networkidle' }); await p.waitForTimeout(1200);
      const r = await state(p);
      ok(r.scene === r.centre && r.dbg.shape === EXPECT[r.centre], `${lang} reload: centre=${r.centre} scene=${r.scene} shape=${r.dbg.shape}`);
      ok(!p.errs.length, `${lang} #${id} errors: ${p.errs.join(' | ')}`);
      await p.context().close();
    }
  }

  // 3. Resize between desktop and phone mid-scene.
  for (const lang of ['ar', 'en']) {
    const p = await page(b, { lang });
    await p.goto(URL, { waitUntil: 'networkidle' }); await p.waitForTimeout(800);
    await goTo(p, 's3'); await p.waitForTimeout(300);
    await p.setViewportSize({ width: 390, height: 844 }); await p.waitForTimeout(500);
    let s = await state(p);
    ok(s.dbg.goal.x === 0 && s.dbg.goal.y > 0 && s.scene === s.centre, `${lang} resize→phone: goal=${JSON.stringify(s.dbg.goal)} centre=${s.centre}`);
    await p.setViewportSize({ width: 1440, height: 900 }); await p.waitForTimeout(500);
    s = await state(p);
    ok(Math.sign(s.dbg.goal.x) === (lang === 'ar' ? -1 : 1) && s.scene === s.centre && s.dbg.shape === EXPECT[s.centre], `${lang} resize→desktop: x=${s.dbg.goal.x} centre=${s.centre} shape=${s.dbg.shape}`);
    await p.context().close();
  }

  // 4. Car drives the way it faces; road flows backwards under it.
  for (const lang of ['ar', 'en']) {
    const p = await page(b, { lang });
    await p.goto(URL, { waitUntil: 'networkidle' }); await p.waitForTimeout(800);
    const top = await p.evaluate(() => document.getElementById('s2').offsetTop);
    await p.evaluate((y) => scrollTo(0, y - 300), top); await p.waitForTimeout(250);
    const d1 = (await state(p)).dbg.goal.drive;
    await p.evaluate((y) => scrollTo(0, y + 500), top); await p.waitForTimeout(250);
    const s2 = await state(p), d2 = s2.dbg.goal.drive;
    const facing = s2.dbg.goal.flipX < 0 ? 1 : -1; // nose is -x unless mirrored
    ok(Math.sign(d2 - d1) === facing, `${lang} car moves ${d2 - d1 > 0 ? 'right' : 'left'} but faces ${facing > 0 ? 'right' : 'left'}`);
    await p.context().close();
  }

  // 5. Frantic scrolling: 120 tiny steps with no pause, then flings to both ends.
  for (const lang of ['ar', 'en']) {
    const p = await page(b, { lang });
    await p.goto(URL, { waitUntil: 'networkidle' }); await p.waitForTimeout(800);
    await p.evaluate(async () => { for (let i = 0; i < 120; i++) { scrollBy(0, (Math.random() - 0.3) * 900); await new Promise(r => setTimeout(r, 8)); } });
    await p.waitForTimeout(400);
    let s = await state(p); ok(s.scene === s.centre && s.dbg.shape === EXPECT[s.centre], `${lang} frantic: centre=${s.centre} shape=${s.dbg.shape}`);
    await p.evaluate(() => scrollTo(0, document.body.scrollHeight)); await p.waitForTimeout(300);
    s = await state(p); ok(s.dbg.shape === EXPECT[s.centre || 'start'], `${lang} bottom: centre=${s.centre} shape=${s.dbg.shape}`);
    await p.evaluate(() => scrollTo(0, 0)); await p.waitForTimeout(300);
    s = await state(p); ok(s.scene === 'hero' && s.dbg.shape === 'towers', `${lang} top: scene=${s.scene} shape=${s.dbg.shape}`);
    // Tab hidden then visible.
    await p.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => true }); document.dispatchEvent(new Event('visibilitychange')); });
    await p.waitForTimeout(200);
    await p.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => false }); document.dispatchEvent(new Event('visibilitychange')); });
    await p.waitForTimeout(300);
    const t1 = (await state(p)).dbg.progress; ok(t1 >= 0, `${lang} after hide/show progress=${t1}`);
    ok(!p.errs.length, `${lang} frantic errors: ${p.errs.join(' | ')}`);
    await p.context().close();
  }

  // 6. Reduced motion: shapes still follow sections, content visible, no animation loop errors.
  for (const lang of ['ar', 'en']) {
    const p = await page(b, { lang, reduced: true });
    await p.goto(URL, { waitUntil: 'networkidle' }); await p.waitForTimeout(800);
    for (const id of ['s1', 's4', 'parents']) { await goTo(p, id); await p.waitForTimeout(250); const s = await state(p); ok(s.dbg.shape === EXPECT[id] && s.dbg.progress === 1, `${lang} reduced ${id}: shape=${s.dbg.shape} progress=${s.dbg.progress}`); }
    const hidden = await p.evaluate(() => [...document.querySelectorAll('.reveal')].filter(e => !e.classList.contains('in')).length);
    ok(hidden === 0, `${lang} reduced: ${hidden} panels stay invisible`);
    ok(!p.errs.length, `${lang} reduced errors: ${p.errs.join(' | ')}`);
    await p.context().close();
  }
  await b.close();

  // 7. No WebGL at all: the site and the form must still work.
  const b2 = await chromium.launch({ args: ['--disable-webgl', '--disable-webgl2', '--disable-gpu'] });
  for (const lang of ['ar', 'en']) {
    const p = await page(b2, { lang });
    await p.goto(URL, { waitUntil: 'networkidle' }); await p.waitForTimeout(800);
    const canvasGone = await p.evaluate(() => !document.getElementById('world'));
    for (const id of IDS) { await goTo(p, id); await p.waitForTimeout(120); }
    const s = await state(p);
    ok(canvasGone && s.dbg === null && s.scene === s.centre, `${lang} no-webgl: canvasGone=${canvasGone} scene=${s.scene} centre=${s.centre}`);
    await p.click('[data-field="who"][data-id="student"]'); await p.click('[data-field="stage"][data-id="g12"]'); await p.click('[data-next]');
    ok(await p.isVisible('[data-field="degree"]'), `${lang} no-webgl: form does not advance`);
    ok(!p.errs.length, `${lang} no-webgl errors: ${p.errs.join(' | ')}`);
    await p.context().close();
  }
  await b2.close();
  console.log(`checks: ${checks}, failures: ${fails.length}`);
  console.log(fails.join('\n'));
})();
