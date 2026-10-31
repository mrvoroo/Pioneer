// For each language and viewport: scroll to every section (several ways) and record which 3D shape shows.
const { chromium } = require('playwright');
const EXPECT = { hero: 'towers', s1: 'school', s2: 'car', s3: 'office', s4: 'globe', s5: 'campus', s6: 'cap', parents: 'shield', team: 'sky', start: 'sky' };
const IDS = Object.keys(EXPECT);
const url = process.argv[2] || (process.env.SITE_URL || 'http://localhost:8080/');
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] });
  const fails = []; let checks = 0;
  for (const lang of ['ar', 'en']) for (const vp of [[1440, 900], [390, 844]]) {
    const p = await b.newPage({ viewport: { width: vp[0], height: vp[1] } });
    const errs = []; p.on('pageerror', e => errs.push(e.message));
    await p.addInitScript((l) => { try { localStorage.clear(); localStorage.setItem('rihla_lang', JSON.stringify(l)); } catch (e) {} }, lang);
    await p.goto(url, { waitUntil: 'networkidle' }); await p.waitForTimeout(1200);
    const tag = `${lang} ${vp[0]}`;
    const check = async (id, how) => {
      const d = await p.evaluate(() => ({ scene: window.__rihla.scene(), dbg: window.__rihla.debug() }));
      checks++;
      if (d.scene !== id || d.dbg.shape !== EXPECT[id]) fails.push(`${tag} ${how} ${id}: scene=${d.scene} shape=${d.dbg.shape} (want ${EXPECT[id]})`);
      return d;
    };
    // 1. Slow scroll down through every section (centered), then back up.
    for (const id of IDS) { await p.evaluate((id) => document.getElementById(id).scrollIntoView({ block: 'center' }), id); await p.waitForTimeout(350); await check(id, 'down'); }
    for (const id of [...IDS].reverse()) { await p.evaluate((id) => document.getElementById(id).scrollIntoView({ block: 'center' }), id); await p.waitForTimeout(350); await check(id, 'up'); }
    // 2. Section top aligned (how anchor links land).
    for (const id of IDS) { await p.evaluate((id) => { const el = document.getElementById(id); window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY); }, id); await p.waitForTimeout(350); await check(id, 'top'); }
    // 3. Random jumps: after each, the shape must match the section under the viewport centre.
    for (let k = 0; k < 25; k++) {
      await p.evaluate(() => window.scrollTo(0, Math.random() * (document.body.scrollHeight - innerHeight)));
      await p.waitForTimeout(300);
      const where = await p.evaluate((ids) => { const y = innerHeight / 2; return ids.find((id) => { const r = document.getElementById(id).getBoundingClientRect(); return r.top <= y && r.bottom >= y; }) || null; }, IDS);
      if (where) await check(where, 'random');
    }
    // 4. Plane: nose must point along travel while scrolling down through s4.
    const s4 = await p.evaluate(() => { const el = document.getElementById('s4'); return { top: el.offsetTop, h: el.offsetHeight }; });
    for (let f = 0.2; f <= 0.8; f += 0.15) {
      await p.evaluate((y) => window.scrollTo(0, y), s4.top + s4.h * f - vp[1] / 2); await p.waitForTimeout(500);
      const d = await p.evaluate(() => window.__rihla.debug()); checks++;
      if (!d.plane.visible || d.plane.noseAlongTravel < 0.6) fails.push(`${tag} plane at ${f.toFixed(2)}: visible=${d.plane.visible} nose·travel=${d.plane.noseAlongTravel.toFixed(2)} t=${d.plane.t.toFixed(2)}`);
    }
    // 5. Shape sits on the side opposite the text (desktop) / above it (mobile).
    await p.evaluate(() => document.getElementById('s3').scrollIntoView({ block: 'center' })); await p.waitForTimeout(400);
    const g = (await p.evaluate(() => window.__rihla.debug())).goal; checks++;
    const panel = await p.evaluate(() => { const r = document.querySelector('#s3 .panel').getBoundingClientRect(); return { cx: r.left + r.width / 2, top: r.top }; });
    if (vp[0] > 860) { const shapeRight = g.x > 0, textRight = panel.cx > vp[0] / 2; if (shapeRight === textRight) fails.push(`${tag} layout: shape x=${g.x} overlaps text side (panel cx ${Math.round(panel.cx)})`); }
    else if (!(g.y > 0)) fails.push(`${tag} mobile layout: shape y=${g.y} not above text`);
    if (errs.length) fails.push(`${tag} page errors: ${errs.join(' | ')}`);
    await p.close();
  }
  console.log(`checks: ${checks}, failures: ${fails.length}`);
  console.log(fails.slice(0, 60).join('\n'));
  await b.close();
})();
