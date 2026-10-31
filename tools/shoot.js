const { chromium } = require('playwright');
const [,, url, out, w='1440', h='900', lang='ar'] = process.argv;
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=swiftshader','--enable-webgl','--ignore-gpu-blocklist'] });
  const p = await b.newPage({ viewport: { width: +w, height: +h } });
  const errs = [];
  p.on('console', m => { if (m.type() === 'error' || m.type()==='warning') errs.push(m.type()+': '+m.text()); });
  p.on('pageerror', e => errs.push('pageerror: ' + e.message));
  await p.addInitScript((l) => { try { localStorage.setItem('rihla_lang', JSON.stringify(l)); } catch(e){} }, lang);
  await p.goto(url, { waitUntil: 'networkidle' });
  await p.waitForTimeout(3500);
  const ids = ['hero','s1','s2','s3','s4','s5','s6','parents','team','start'];
  for (const id of ids) {
    await p.evaluate((id) => document.getElementById(id).scrollIntoView({block: id==='hero'?'start':'center'}), id);
    await p.waitForTimeout(2600);
    await p.screenshot({ path: `${out}-${id}.jpg`, quality: 55, type: 'jpeg' });
  }
  console.log(errs.slice(0,20).join('\n') || 'no console errors');
  await b.close();
})();
