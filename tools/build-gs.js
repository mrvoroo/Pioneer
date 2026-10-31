// Builds apps-script/Code.gs from the template, seeding the sheet with the site's default content.
// Run after editing assets/js/content.js:  node tools/build-gs.js
const fs = require('fs'), path = require('path'), vm = require('vm');
const root = path.join(__dirname, '..');
const ctx = { window: {} };
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(root, 'assets/js/content.js'), 'utf8'), ctx);
const seed = JSON.stringify(ctx.window.RIHLA_DEFAULTS, null, 1);
const tpl = fs.readFileSync(path.join(root, 'apps-script/Code.template.gs'), 'utf8');
if (!tpl.includes('/*__SEED__*/ {}')) throw new Error('seed marker missing');
fs.writeFileSync(path.join(root, 'apps-script/Code.gs'), tpl.replace('/*__SEED__*/ {}', seed));
console.log('apps-script/Code.gs written,', Math.round(seed.length / 1024), 'KB of seed data');
