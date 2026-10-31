// Rihla Malaysia: page rendering, the scroll story, and the lead form.
import { createWorld } from './world.js';

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const store = {
  get(k, s = localStorage) { try { return JSON.parse(s.getItem(k)); } catch (_) { return null; } },
  set(k, v, s = localStorage) { try { s.setItem(k, JSON.stringify(v)); } catch (_) { /* storage off: fine */ } },
  del(k, s = localStorage) { try { s.removeItem(k); } catch (_) { /* ignore */ } }
};
const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const isMobile = () => window.matchMedia('(max-width: 860px)').matches;

/* ---------------- Content: defaults + the Google Sheet ---------------- */
const DEF = window.RIHLA_DEFAULTS;
const API = (window.RIHLA_CONFIG && window.RIHLA_CONFIG.SHEET_API_URL || '').trim();
let C = structuredClone(DEF);

function mergeConfig(remote) {
  if (!remote || typeof remote !== 'object') return;
  const next = structuredClone(DEF);
  if (remote.settings) Object.entries(remote.settings).forEach(([k, v]) => { if (v !== '' && v != null) next.settings[k] = String(v); });
  if (remote.texts) Object.entries(remote.texts).forEach(([k, v]) => {
    if (!v) return;
    next.texts[k] = { ar: v.ar || (next.texts[k] && next.texts[k].ar) || '', en: v.en || (next.texts[k] && next.texts[k].en) || '' };
  });
  ['universityTypes', 'universities', 'majorGroups', 'majors', 'options', 'team'].forEach((key) => {
    if (Array.isArray(remote[key])) next[key] = remote[key];
  });
  C = next;
}

async function loadConfig() {
  const cached = store.get('rihla_cfg');
  if (!API) return;
  const fresh = cached && Date.now() - cached.at < 10 * 60 * 1000;
  if (cached) mergeConfig(cached.data);
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), cached ? 6000 : 3500);
  const req = fetch(API + (API.includes('?') ? '&' : '?') + 'action=config', { signal: ctrl.signal })
    .then((r) => r.json())
    .then((data) => { if (data && data.ok !== false) { store.set('rihla_cfg', { at: Date.now(), data }); return data; } return null; })
    .catch(() => null)
    .finally(() => clearTimeout(timer));
  if (cached && fresh) { req.then(() => {}); return; } // use the cache now, refresh for next visit
  const data = await req;
  if (data) mergeConfig(data);
}

/* ---------------- Language ---------------- */
let lang = store.get('rihla_lang') === 'en' ? 'en' : 'ar';
const t = (k, vars) => {
  const e = C.texts[k];
  let s = e ? (e[lang] || e.ar || '') : k;
  if (vars) Object.entries(vars).forEach(([a, b]) => { s = s.split('{' + a + '}').join(b); });
  return s;
};
const L = (o, base = '') => (o ? (o[(base ? base + '_' : '') + lang] || o[(base ? base + '_' : '') + 'ar'] || o[lang] || o.ar || '') : '');
const opts = (list) => C.options.filter((o) => o.list === list);
const optLabel = (list, id, l = lang) => { const o = C.options.find((x) => x.list === list && x.id === id); return o ? (o[l] || o.ar) : (id || ''); };

/* ---------------- Icons ---------------- */
const ICONS = {
  arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  check: '<path d="M5 12.5l4.2 4.2L19 7"/>',
  plane: '<path d="M2.5 13.5l8-2.2L14 3.5l2 .6-1.6 7.1 5.3-1.4c1-.3 2 .5 1.8 1.5-.1.5-.5.9-1 1.1l-15.3 4.3-2.7-2.6z"/>',
  office: '<path d="M4 21V5l8-2v18M12 8l8 2v11M3 21h18M7 8h2M7 12h2M7 16h2M15 13h2M15 17h2"/>',
  video: '<rect x="3" y="6" width="13" height="12" rx="2"/><path d="M16 10l5-3v10l-5-3"/>',
  phone: '<path d="M5 3h4l2 5-2.5 1.5a11 11 0 005 5L15 12l5 2v4a2 2 0 01-2 2A16 16 0 013 5a2 2 0 012-2z"/>',
  chat: '<path d="M4 18l1.3-3.6A8 8 0 1112 20a8 8 0 01-3.7-.9L4 18z"/>',
  wa: '<path d="M4 20l1.2-4.1A8.5 8.5 0 1112.5 20.5 8.4 8.4 0 018.4 19.4L4 20z"/><path d="M9 9c0 3 2.6 5.8 6 6l1-1.6-2-.9-.9.9c-1-.4-2-1.4-2.4-2.4l.9-.9-.9-2L9 9z"/>',
  pin: '<path d="M12 21s-7-6.2-7-12a7 7 0 0114 0c0 5.8-7 12-7 12z"/><circle cx="12" cy="9" r="2.5"/>',
  sim: '<path d="M7 3h7l4 4v14H7z"/><rect x="9.5" y="11" width="6" height="6" rx="1"/>',
  home: '<path d="M4 11l8-7 8 7v9H4z"/><path d="M10 20v-5h4v5"/>',
  doc: '<path d="M7 3h7l4 4v14H7z"/><path d="M14 3v4h4M10 12h5M10 16h5"/>',
  team: '<circle cx="9" cy="8" r="3"/><circle cx="17" cy="9" r="2.4"/><path d="M3 20a6 6 0 0112 0M14 20a5 5 0 017-4.5"/>',
  shield: '<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/><path d="M8.5 12l2.5 2.5 4.5-5"/>',
  cal: '<rect x="3.5" y="5" width="17" height="15" rx="2"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
  search: '<circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4.2-4.2"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1"/>',
  pulse: '<path d="M3 12h4l2-5 4 10 2-5h6"/>',
  chip: '<rect x="6" y="6" width="12" height="12" rx="2"/><path d="M9 2v4M15 2v4M9 18v4M15 18v4M2 9h4M2 15h4M18 9h4M18 15h4"/>',
  chart: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  pen: '<path d="M4 20l4-1 11-11-3-3L5 16z"/><path d="M14 6l3 3"/>',
  scale: '<path d="M12 3v18M5 21h14M6 7h12M6 7l-3 7a3 3 0 006 0zM18 7l-3 7a3 3 0 006 0z"/>',
  atom: '<circle cx="12" cy="12" r="1.6"/><ellipse cx="12" cy="12" rx="9" ry="3.6"/><ellipse cx="12" cy="12" rx="9" ry="3.6" transform="rotate(60 12 12)"/><ellipse cx="12" cy="12" rx="9" ry="3.6" transform="rotate(-60 12 12)"/>',
  question: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 114 2c-1 .7-1.5 1.2-1.5 2.5M12 17h.01"/>'
};
const icon = (n, s = 20) => `<svg class="ic${n === 'arrow' ? ' ic--dir' : ''}" width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[n] || ''}</svg>`;
const logo = () => `<svg class="logo" viewBox="0 0 48 32" aria-hidden="true"><path d="M4 26 Q24 -6 44 26" fill="none" stroke="url(#lg)" stroke-width="2.4" stroke-dasharray="3 4" stroke-linecap="round"/><circle cx="4" cy="26" r="3.4" fill="#19c3b1"/><circle cx="44" cy="26" r="3.4" fill="#f5b942"/><defs><linearGradient id="lg" x1="0" x2="1"><stop offset="0" stop-color="#19c3b1"/><stop offset="1" stop-color="#f5b942"/></linearGradient></defs></svg>`;

/* ---------------- Tracking where the visitor came from ---------------- */
const TRACK = (() => {
  const prev = store.get('rihla_src', sessionStorage);
  if (prev) return prev;
  const q = new URLSearchParams(location.search);
  const v = {
    utm_source: q.get('utm_source') || '', utm_medium: q.get('utm_medium') || '', utm_campaign: q.get('utm_campaign') || '',
    utm_content: q.get('utm_content') || '', ref: q.get('ref') || q.get('r') || '',
    landing_page: location.href.split('#')[0], referrer: document.referrer || ''
  };
  store.set('rihla_src', v, sessionStorage);
  return v;
})();

/* ---------------- Rendering ---------------- */
const SCENES = [
  { id: 'hero', shape: 'towers', mode: 'spin' },
  { id: 's1', shape: 'school', mode: 'face', yaw: -0.4, st: 'st1' },
  { id: 's2', shape: 'car', mode: 'face', yaw: 0.18, st: 'st2' },
  { id: 's3', shape: 'office', mode: 'face', yaw: 0.25, st: 'st3' },
  { id: 's4', shape: 'globe', mode: 'face', yaw: 0, st: 'st4' },
  { id: 's5', shape: 'campus', mode: 'face', yaw: -0.35, st: 'st5' },
  { id: 's6', shape: 'cap', mode: 'spin', st: 'st6' },
  { id: 'parents', shape: 'shield', mode: 'face', yaw: 0 },
  { id: 'team', shape: 'sky', mode: 'spin' },
  { id: 'start', shape: 'sky', mode: 'spin' }
];

function header() {
  return `
  <div class="wrap header__in">
    <a class="brand" href="#top" aria-label="${esc(t('brand'))}">${logo()}<span><b>${esc(t('brand'))}</b><small>${esc(t('brand_sub'))}</small></span></a>
    <nav class="nav" aria-label="${lang === 'ar' ? 'القائمة' : 'Menu'}">
      <a href="#s1">${esc(t('nav_journey'))}</a><a href="#s5">${esc(t('nav_unis'))}</a><a href="#parents">${esc(t('nav_parents'))}</a><a href="#team">${esc(t('nav_team'))}</a>
    </nav>
    <div class="header__actions">
      <button class="lang" type="button" data-lang aria-label="${lang === 'ar' ? 'Switch to English' : 'التبديل إلى العربية'}">${esc(t('lang_switch'))}</button>
      <a class="btn btn--gold btn--sm" href="#start">${esc(t('nav_cta'))}</a>
    </div>
  </div>`;
}

function rail() {
  return SCENES.filter((s) => s.st).map((s, i) => `<a href="#${s.id}" data-rail="${s.id}"><i>${String(i + 1).padStart(2, '0')}</i><span>${esc(t(s.st))}</span></a>`).join('');
}

const kicker = (k) => `<p class="kicker">${esc(t(k))}</p>`;
const sceneWrap = (id, inner, cls = '') => `<section class="scene ${cls}" id="${id}" data-scene="${id}"><div class="wrap"><div class="panel reveal">${inner}</div></div></section>`;

function heroHtml() {
  const stats = [1, 2, 3, 4].map((n) => `<li><b dir="ltr">${esc(t('stat' + n + '_n'))}</b><span>${esc(t('stat' + n + '_l'))}</span></li>`).join('');
  return `
  <section class="scene scene--hero" id="hero" data-scene="hero">
    <div class="wrap">
      <div class="hero">
        <p class="kicker kicker--pill">${esc(t('hero_kicker'))}</p>
        <h1 class="hero__title"><span class="hl-a">${esc(t('hero_title_a'))}</span><span class="hl-b">${esc(t('hero_title_b'))}</span></h1>
        <p class="hero__sub">${esc(t('hero_sub'))}</p>
        <div class="hero__cta">
          <a class="btn btn--gold btn--lg" href="#start">${icon('cal', 20)}${esc(t('hero_cta'))}</a>
          <a class="btn btn--ghost btn--lg" href="#s1">${esc(t('hero_cta2'))}</a>
        </div>
        <ul class="stats">${stats}</ul>
        <p class="stats__note">${esc(t('stats_note'))}</p>
      </div>
    </div>
    <a class="scroll-hint" href="#s1"><span>${esc(t('scroll_hint'))}</span><i></i></a>
  </section>`;
}

function s1Html() {
  const qs = [1, 2, 3, 4, 5].map((n) => `<li>${icon('question', 18)}<span>${esc(t('s1_q' + n))}</span></li>`).join('');
  return sceneWrap('s1', `${kicker('s1_kicker')}<h2>${esc(t('s1_title'))}</h2><p>${esc(t('s1_body'))}</p><ul class="questions">${qs}</ul>`);
}
function s2Html() {
  const m = [['office', 's2_m1'], ['video', 's2_m2'], ['phone', 's2_m3'], ['wa', 's2_m4']].map(([ic, k]) => `<li>${icon(ic, 22)}<span>${esc(t(k))}</span></li>`).join('');
  return sceneWrap('s2', `${kicker('s2_kicker')}<h2>${esc(t('s2_title'))}</h2><p>${esc(t('s2_body'))}</p><ul class="modes">${m}</ul><a class="btn btn--gold" href="#start">${esc(t('hero_cta'))}</a>`);
}
function s3Html() {
  const steps = [1, 2, 3, 4].map((n) => `<li><i>${n}</i><div><b>${esc(t('s3_p' + n + 't'))}</b><span>${esc(t('s3_p' + n))}</span></div></li>`).join('');
  return sceneWrap('s3', `${kicker('s3_kicker')}<h2>${esc(t('s3_title'))}</h2><p>${esc(t('s3_body'))}</p><ol class="timeline">${steps}</ol>`);
}
function s4Html() {
  const items = [['plane', 's4_i1'], ['sim', 's4_i2'], ['home', 's4_i3'], ['doc', 's4_i4'], ['team', 's4_i5']].map(([ic, k]) => `<li>${icon(ic, 20)}<span>${esc(t(k))}</span></li>`).join('');
  return sceneWrap('s4', `${kicker('s4_kicker')}<h2>${esc(t('s4_title'))}</h2><p>${esc(t('s4_body'))}</p>
    <div class="route" dir="ltr"><span class="route__c"><b>RUH</b><small>${esc(t('s4_from'))}</small></span><span class="route__line"><i class="route__plane">${icon('plane', 22)}</i></span><span class="route__c"><b>KUL</b><small>${esc(t('s4_to'))}</small></span></div>
    <ul class="checks">${items}</ul>`);
}
function s5Html() {
  const tabs = C.universityTypes.map((ty, i) => `<button type="button" role="tab" class="tab" data-type="${esc(ty.id)}" aria-selected="${i === 0}">${esc(L(ty))}</button>`).join('');
  const facts = [1, 2, 3].map((n) => `<li><b dir="ltr">${esc(t('s5_f' + n + 'n'))}</b><span>${esc(t('s5_f' + n))}</span></li>`).join('');
  return sceneWrap('s5', `${kicker('s5_kicker')}<h2>${esc(t('s5_title'))}</h2><p>${esc(t('s5_body'))}</p>
    <div class="tabs" role="tablist">${tabs}</div><div class="typepanel" id="typepanel" role="tabpanel" aria-live="polite"></div>
    <ul class="facts">${facts}</ul>`);
}
function typePanel(id) {
  const ty = C.universityTypes.find((x) => x.id === id) || C.universityTypes[0];
  if (!ty) return '';
  const unis = C.universities.filter((u) => u.type === ty.id);
  return `<p>${esc(L(ty, 'desc'))}</p>
    <dl><div><dt>${esc(t('s5_cost'))}</dt><dd>${esc(L(ty, 'cost'))}</dd></div><div><dt>${esc(t('s5_fit'))}</dt><dd>${esc(L(ty, 'fit'))}</dd></div></dl>
    ${unis.length ? `<p class="mini">${esc(t('s5_examples'))}</p><ul class="unis">${unis.map((u) => `<li>${esc(u.short)}${u.badge_ar ? `<em>${esc(L(u, 'badge'))}</em>` : ''}</li>`).join('')}</ul>` : ''}`;
}
function s6Html() {
  return sceneWrap('s6', `${kicker('s6_kicker')}<h2>${esc(t('s6_title'))}</h2><p>${esc(t('s6_body'))}</p><a class="btn btn--gold btn--lg" href="#start">${esc(t('s6_cta'))}${icon('arrow', 18)}</a>`);
}
function parentsHtml() {
  const qa = [1, 2, 3, 4, 5].filter((n) => t('p_q' + n)).map((n, i) => `<details ${i === 0 ? 'open' : ''}><summary>${esc(t('p_q' + n))}</summary><p>${esc(t('p_a' + n))}</p></details>`).join('');
  return sceneWrap('parents', `<p class="kicker">${icon('shield', 18)} ${esc(t('p_kicker'))}</p><h2>${esc(t('p_title'))}</h2><p>${esc(t('p_body'))}</p><div class="faq">${qa}</div>`, 'scene--parents');
}
const initials = (name) => name.replace(/^(م\.|Eng\.|د\.|Dr\.)\s*/, '').trim().split(/\s+/).map((w) => w[0]).slice(0, 2).join('');
function teamHtml() {
  const cards = C.team.map((m) => {
    const name = L(m, 'name'), wa = (m.whatsapp || '').replace(/\D/g, '');
    return `<li class="member"><span class="avatar" aria-hidden="true">${esc(initials(name))}</span><b>${esc(name)}</b><span>${esc(L(m, 'role'))}</span>
      ${wa ? `<a class="btn btn--ghost btn--sm" href="https://wa.me/${wa}?text=${encodeURIComponent(t('wa_intro'))}" target="_blank" rel="noopener">${icon('wa', 18)}${esc(t('t_whatsapp'))}</a>` : ''}</li>`;
  }).join('');
  return `<section class="scene scene--team" id="team" data-scene="team"><div class="wrap"><div class="panel panel--wide reveal">${kicker('t_kicker')}<h2>${esc(t('t_title'))}</h2><p>${esc(t('t_body'))}</p><ul class="team">${cards}</ul></div></div></section>`;
}
function formShell() {
  return `<section class="scene scene--form" id="start" data-scene="start"><div class="wrap">
    <div class="formcard reveal">
      <div class="formcard__head">${kicker('f_kicker')}<h2>${esc(t('f_title'))}</h2><p>${esc(t('f_body'))}</p></div>
      <div class="progress" aria-hidden="true"><i id="fprog"></i></div>
      <p class="steplabel" id="steplabel" aria-live="polite"></p>
      <form id="leadform" novalidate autocomplete="on"></form>
    </div></div></section>`;
}
function footerHtml() {
  const s = C.settings;
  const social = [['instagram_url', 'Instagram'], ['snapchat_url', 'Snapchat'], ['tiktok_url', 'TikTok'], ['youtube_url', 'YouTube']].filter(([k]) => s[k]).map(([k, n]) => `<a href="${esc(s[k])}" target="_blank" rel="noopener">${n}</a>`).join('');
  return `<div class="wrap footer__in">
    <div><a class="brand" href="#top">${logo()}<span><b>${esc(t('brand'))}</b><small>${esc(t('brand_sub'))}</small></span></a><p class="muted">${esc(t('footer_note'))}</p></div>
    <div><b>${esc(t('footer_office'))}</b><p class="muted">${esc(t('footer_address'))}</p><p class="muted">${esc(t('footer_hours'))}</p>${s.office_map_url ? `<a href="${esc(s.office_map_url)}" target="_blank" rel="noopener">${icon('pin', 16)} ${esc(t('footer_map'))}</a>` : ''}</div>
    <div class="footer__links">${social}<button type="button" class="linkbtn" data-privacy>${esc(t('footer_privacy'))}</button></div>
  </div>`;
}

/* ---------------- The lead form ---------------- */
const STEP_COUNT = 6;
const F = Object.assign({
  step: 0, who: '', stage: '', degree: '', grades: '', english: '', groups: [], majors: [], notSure: false,
  uniTarget: '', unis: [], budget: '', intake: '', recognition: '', funding: '',
  name: '', studentName: '', phone: '', waSame: true, whatsapp: '', email: '', city: '', mode: '', time: '', consultant: '', consent: false, hp: ''
}, store.get('rihla_form') || {});
if (F.step > 5) F.step = 0;
if (F.groups.length > 1) { const g = F.groups[F.groups.length - 1]; F.groups = [g]; F.majors = F.majors.filter((m) => (DEF.majors.find((x) => x.id === m) || {}).group === g); }
let leadId = '';
const save = () => { const { hp, ...rest } = F; store.set('rihla_form', rest); };

const chip = (field, id, label, on, extra = '') => `<button type="button" class="chip" data-field="${field}" data-id="${esc(id)}" aria-pressed="${on}" ${extra}>${on ? icon('check', 15) : ''}<span>${esc(label)}</span></button>`;
const single = (field, list, title) => `<fieldset class="q"><legend>${esc(t(title))}</legend><div class="chips">${opts(list).map((o) => chip(field, o.id, L(o), F[field] === o.id)).join('')}</div></fieldset>`;

function stepHtml(n) {
  if (n === 0) return single('who', 'who', 'f_q_who') + single('stage', 'stage', 'f_q_stage');
  if (n === 1) return single('degree', 'degree', 'f_q_degree') + single('grades', 'grades', 'f_q_grades') + single('english', 'english', 'f_q_english');
  if (n === 2) {
    const groups = C.majorGroups.map((g) => {
      const on = F.groups.includes(g.id), count = C.majors.filter((m) => m.group === g.id && F.majors.includes(m.id)).length;
      return `<button type="button" class="chip chip--group" data-group="${esc(g.id)}" aria-pressed="${on}" aria-expanded="${on}">${icon(g.icon || 'gear', 18)}<span>${esc(L(g))}</span>${count ? `<em>${count}</em>` : ''}</button>`;
    }).join('');
    const subs = F.groups.map((gid) => {
      const g = C.majorGroups.find((x) => x.id === gid); if (!g) return '';
      const ms = C.majors.filter((m) => m.group === gid);
      return `<div class="subchips" data-sub="${esc(gid)}"><p class="subchips__t">${icon(g.icon || 'gear', 16)} ${esc(L(g))}</p><div class="chips">${ms.map((m) => chip('majors', m.id, L(m), F.majors.includes(m.id))).join('')}</div></div>`;
    }).join('');
    return `<fieldset class="q"><legend>${esc(t('f_q_majors'))}</legend><p class="hint">${esc(t('f_h_majors'))}</p>
      <div class="chips">${groups}${chip('notSure', 'yes', t('f_not_sure'), F.notSure)}</div></fieldset><div class="subs">${subs}</div>`;
  }
  if (n === 3) {
    const yn = `<fieldset class="q"><legend>${esc(t('f_q_unitarget'))}</legend><div class="chips">${chip('uniTarget', 'yes', t('f_yes'), F.uniTarget === 'yes')}${chip('uniTarget', 'no', t('f_no'), F.uniTarget === 'no')}</div></fieldset>`;
    if (F.uniTarget === 'no') return yn + `<p class="note">${icon('check', 18)} ${esc(t('f_uni_none'))}</p>`;
    if (F.uniTarget !== 'yes') return yn;
    const byType = C.universityTypes.map((ty) => {
      const us = C.universities.filter((u) => u.type === ty.id); if (!us.length) return '';
      return `<div class="subchips" data-type="${esc(ty.id)}"><p class="subchips__t">${esc(L(ty))}</p><div class="chips">${us.map((u) => chip('unis', u.id, (lang === 'ar' ? u.name_ar : u.name_en) || u.short, F.unis.includes(u.id), `data-search="${esc((u.short + ' ' + u.name_en + ' ' + u.name_ar).toLowerCase())}"`)).join('')}</div></div>`;
    }).join('');
    return yn + `<p class="hint">${esc(t('f_h_unis'))}</p><label class="search">${icon('search', 18)}<input type="search" id="unisearch" placeholder="${esc(t('f_uni_search'))}" aria-label="${esc(t('f_uni_search'))}"></label><div class="subs">${byType}</div>`;
  }
  if (n === 4) return single('budget', 'budget', 'f_q_budget') + single('intake', 'intake', 'f_q_intake') + single('recognition', 'recognition', 'f_q_recognition') + single('funding', 'funding', 'f_q_funding');
  if (n === 5) {
    const team = C.team.filter((m) => m.receives_leads !== false && String(m.receives_leads) !== 'false');
    const cons = team.length > 1 ? `<fieldset class="q"><legend>${esc(t('f_q_consultant'))}</legend><div class="chips">${chip('consultant', 'any', lang === 'ar' ? 'أي مستشار' : 'Anyone', F.consultant === 'any' || !F.consultant)}${team.map((m) => chip('consultant', m.id, L(m, 'name'), F.consultant === m.id)).join('')}</div></fieldset>` : '';
    return `<fieldset class="q"><legend>${esc(t('f_q_contact'))}</legend>
      <div class="fields">
        <label class="field"><span>${esc(t('f_name'))}</span><input name="name" autocomplete="name" value="${esc(F.name)}" required></label>
        ${F.who === 'parent' ? `<label class="field"><span>${esc(t('f_student_name'))}</span><input name="studentName" value="${esc(F.studentName)}"></label>` : ''}
        <label class="field"><span>${esc(t('f_phone'))}</span><input name="phone" type="tel" inputmode="tel" autocomplete="tel" dir="ltr" placeholder="${esc(t('f_phone_ph'))}" value="${esc(F.phone)}" required></label>
        <label class="check"><input type="checkbox" name="waSame" ${F.waSame ? 'checked' : ''}><span>${esc(t('f_wa_same'))}</span></label>
        ${F.waSame ? '' : `<label class="field"><span>${esc(t('f_whatsapp'))}</span><input name="whatsapp" type="tel" inputmode="tel" dir="ltr" value="${esc(F.whatsapp)}"></label>`}
        <label class="field"><span>${esc(t('f_email'))} <small>${esc(t('f_email_opt'))}</small></span><input name="email" type="email" autocomplete="email" dir="ltr" value="${esc(F.email)}"></label>
        <label class="hp" aria-hidden="true">Website<input name="hp" tabindex="-1" autocomplete="off"></label>
      </div></fieldset>
      ${single('city', 'city', 'f_q_city')}${single('mode', 'mode', 'f_q_mode')}${single('time', 'time', 'f_q_time')}${cons}
      <label class="check check--consent"><input type="checkbox" name="consent" ${F.consent ? 'checked' : ''}><span>${esc(t('f_consent'))} <button type="button" class="linkbtn" data-privacy>${esc(t('f_privacy_link'))}</button>.</span></label>`;
  }
  return '';
}

function renderForm(focus = false) {
  const form = $('#leadform'); if (!form) return;
  if (F.step >= STEP_COUNT) return;
  form.innerHTML = `<div class="step" data-step="${F.step}">${stepHtml(F.step)}</div>
    <p class="ferr" id="ferr" role="alert"></p>
    <div class="fnav">
      ${F.step > 0 ? `<button type="button" class="btn btn--ghost" data-back>${esc(t('f_back'))}</button>` : '<span></span>'}
      <button type="${F.step === STEP_COUNT - 1 ? 'submit' : 'button'}" class="btn btn--gold" data-next>${esc(F.step === STEP_COUNT - 1 ? t('f_submit') : t('f_next'))}${icon('arrow', 18)}</button>
    </div>`;
  $('#fprog').style.width = ((F.step + 1) / STEP_COUNT * 100) + '%';
  $('#steplabel').textContent = `${t('f_step')} ${F.step + 1} ${t('f_of')} ${STEP_COUNT}`;
  if (focus) { const first = form.querySelector('legend'); if (first) { first.setAttribute('tabindex', '-1'); first.focus({ preventScroll: true }); } }
}

const toggle = (arr, id) => (arr.includes(id) ? arr.filter((x) => x !== id) : [...arr, id]);
function onFormClick(e) {
  const b = e.target.closest('button'); if (!b) return;
  if (!b.hasAttribute('data-next')) showErr('');
  if (b.hasAttribute('data-privacy')) { openPrivacy(); return; }
  if (b.hasAttribute('data-back')) { F.step = Math.max(0, F.step - 1); save(); renderForm(true); scrollToForm(); return; }
  if (b.hasAttribute('data-next') && b.type === 'button') { next(); return; }
  if (b.dataset.group) {
    const g = b.dataset.group;
    // One field at a time: opening a field closes the other one and drops its majors.
    if (F.groups.includes(g)) { F.groups = []; F.majors = []; }
    else { F.groups = [g]; F.majors = F.majors.filter((m) => (C.majors.find((x) => x.id === m) || {}).group === g); F.notSure = false; }
    save(); renderForm();
    const sub = $(`[data-sub="${g}"]`); if (sub) sub.scrollIntoView({ block: 'nearest', behavior: reduced ? 'auto' : 'smooth' });
    return;
  }
  const field = b.dataset.field; if (!field) return;
  const id = b.dataset.id;
  if (field === 'majors' || field === 'unis') F[field] = toggle(F[field], id);
  else if (field === 'notSure') { F.notSure = !F.notSure; if (F.notSure) { F.groups = []; F.majors = []; } }
  else {
    F[field] = id;
    if (field === 'uniTarget' && id === 'no') F.unis = [];
    if (field === 'stage') {
      const map = { g11: 'bachelor', g12: 'bachelor', hs_grad: 'bachelor', uni_student: 'bachelor', bachelor: 'master', master: 'phd' };
      if (!F.degree && map[id]) F.degree = map[id];
    }
    if (field === 'who' && id === 'graduate' && !F.stage) F.stage = 'bachelor';
  }
  save();
  const y = window.scrollY; renderForm(); window.scrollTo(0, y);
}
function onFormInput(e) {
  const el = e.target;
  if (el.id === 'unisearch') {
    const q = el.value.trim().toLowerCase();
    $$('[data-search]').forEach((c) => { c.hidden = !!q && !c.dataset.search.includes(q); });
    $$('.subchips[data-type]').forEach((g) => { g.hidden = !g.querySelector('[data-search]:not([hidden])'); });
    return;
  }
  if (!el.name) return;
  showErr('');
  if (el.type === 'checkbox') {
    F[el.name] = el.checked;
    if (el.name === 'waSame') { save(); renderForm(); return; }
  } else if (el.name === 'hp') F.hp = el.value;
  else F[el.name] = el.value;
  save();
}

function normPhone(raw) {
  const plus = String(raw || '').trim().startsWith('+');
  let d = String(raw || '').replace(/\D/g, '');
  if (d.startsWith('00')) d = d.slice(2);
  if (/^05\d{8}$/.test(d)) return '966' + d.slice(1);
  if (/^5\d{8}$/.test(d)) return '966' + d;
  if (/^9665\d{8}$/.test(d)) return d;
  if ((plus || raw.startsWith('00')) && d.length >= 8 && d.length <= 15) return d;
  return '';
}

function validate() {
  const need = (...ks) => ks.every((k) => F[k]);
  const s = F.step;
  if (s === 0 && !need('who', 'stage')) return t('f_err_pick');
  if (s === 1 && !need('degree', 'grades', 'english')) return t('f_err_pick');
  if (s === 2 && !F.notSure && !F.majors.length) return F.groups.length ? t('f_err_majors') : t('f_err_majors');
  if (s === 3 && !F.uniTarget) return t('f_err_pick');
  if (s === 3 && F.uniTarget === 'yes' && !F.unis.length) return t('f_err_unis');
  if (s === 4 && !need('budget', 'intake', 'recognition')) return t('f_err_pick');
  if (s === 5) {
    if (F.name.trim().length < 2) return t('f_err_name');
    if (!normPhone(F.phone)) return t('f_err_phone');
    if (!F.waSame && F.whatsapp && !normPhone(F.whatsapp)) return t('f_err_phone');
    if (F.email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(F.email.trim())) return t('f_err_email');
    if (!F.consent) return t('f_err_consent');
  }
  return '';
}
function showErr(msg) { const el = $('#ferr'); if (el) el.textContent = msg; }
function scrollToForm() { const el = $('#start .formcard'); if (el) el.scrollIntoView({ block: 'start', behavior: reduced ? 'auto' : 'smooth' }); }
function next() {
  const err = validate(); if (err) { showErr(err); return; }
  F.step += 1; save(); renderForm(true); scrollToForm();
}

/* ---- submit ---- */
const labelsFor = (l) => ({
  who: optLabel('who', F.who, l), stage: optLabel('stage', F.stage, l), degree: optLabel('degree', F.degree, l), grades: optLabel('grades', F.grades, l), english: optLabel('english', F.english, l),
  major_groups: F.groups.map((g) => { const x = C.majorGroups.find((y) => y.id === g); return x ? x[l] || x.ar : g; }).join('، '),
  majors: F.notSure ? (l === 'ar' ? 'لسه مو متأكد' : 'Not sure yet') : F.majors.map((m) => { const x = C.majors.find((y) => y.id === m); return x ? x[l] || x.ar : m; }).join('، '),
  universities: F.unis.map((u) => { const x = C.universities.find((y) => y.id === u); return x ? (x.short) : u; }).join('، '),
  uni_target: F.uniTarget === 'yes' ? (l === 'ar' ? 'نعم' : 'Yes') : (l === 'ar' ? 'لا، يحتاج ترشيح' : 'No, needs suggestions'),
  budget: optLabel('budget', F.budget, l), intake: optLabel('intake', F.intake, l), recognition: optLabel('recognition', F.recognition, l), funding: optLabel('funding', F.funding, l),
  city: optLabel('city', F.city, l), consult_mode: optLabel('mode', F.mode, l), best_time: optLabel('time', F.time, l),
  preferred_consultant: F.consultant && F.consultant !== 'any' ? L(C.team.find((m) => m.id === F.consultant) || {}, 'name') : (l === 'ar' ? 'أي مستشار' : 'Anyone')
});
const makeId = () => { const d = new Date(); const p = (n) => String(n).padStart(2, '0'); return `R${String(d.getFullYear()).slice(2)}${p(d.getMonth() + 1)}${p(d.getDate())}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`; };

function waText(id) {
  const lb = labelsFor(lang);
  const lines = [t('wa_intro'), '', `${lang === 'ar' ? 'رقم الطلب' : 'Request'}: ${id}`, `${t('f_name')}: ${F.name}`];
  if (lb.majors) lines.push(`${lang === 'ar' ? 'التخصص' : 'Major'}: ${lb.majors}`);
  if (lb.universities) lines.push(`${lang === 'ar' ? 'الجامعات' : 'Universities'}: ${lb.universities}`);
  if (F.intake) lines.push(`${lang === 'ar' ? 'موعد البدء' : 'Start'}: ${lb.intake}`);
  return lines.join('\n');
}
function waLink(id, number) {
  const n = String(number || C.settings.whatsapp_number || '').replace(/\D/g, '');
  return n ? `https://wa.me/${n}?text=${encodeURIComponent(waText(id))}` : '';
}

let sending = false;
async function submit(e) {
  e.preventDefault();
  if (sending) return;
  if (F.step !== STEP_COUNT - 1) { next(); return; }
  const err = validate(); if (err) { showErr(err); return; }
  const btn = $('[data-next]'); btn.disabled = true; btn.textContent = t('f_sending');
  sending = true;
  leadId = leadId || makeId();
  const payload = {
    lead_id: leadId, lang, who: F.who, stage: F.stage, degree: F.degree, grades: F.grades, english: F.english,
    major_groups: F.groups, majors: F.notSure ? ['not_sure'] : F.majors, uni_target: F.uniTarget, universities: F.unis,
    budget: F.budget, intake: F.intake, recognition: F.recognition, funding: F.funding,
    full_name: F.name.trim(), student_name: F.studentName.trim(), phone: normPhone(F.phone), whatsapp: F.waSame ? normPhone(F.phone) : normPhone(F.whatsapp),
    email: F.email.trim(), city: F.city, consult_mode: F.mode, best_time: F.time, preferred_consultant: F.consultant || 'any',
    consent: true, consent_at: new Date().toISOString(), hp: F.hp,
    device: isMobile() ? 'mobile' : 'desktop', user_agent: navigator.userAgent.slice(0, 180),
    labels: labelsFor('ar'), ...TRACK
  };
  let result = { ok: false, preview: !API };
  if (API) {
    try {
      const ctrl = new AbortController(); const tm = setTimeout(() => ctrl.abort(), 20000);
      const res = await fetch(API, { method: 'POST', body: JSON.stringify(payload), signal: ctrl.signal });
      clearTimeout(tm);
      result = await res.json();
    } catch (_) { result = { ok: false }; }
  } else result = { ok: true, preview: true };
  sending = false;
  if (result.ok) {
    track('Lead');
    F.step = STEP_COUNT; save();
    renderSuccess(result);
    store.del('rihla_form');
  } else {
    btn.disabled = false; btn.innerHTML = esc(t('f_submit')) + icon('arrow', 18);
    const link = waLink(leadId);
    $('#ferr').innerHTML = `${esc(t('err_send'))} ${link ? `<a class="btn btn--gold btn--sm" href="${link}" target="_blank" rel="noopener">${icon('wa', 16)}${esc(t('ok_wa'))}</a>` : ''}`;
  }
}

function renderSuccess(result) {
  const id = result.id || leadId;
  const lb = labelsFor(lang);
  const rows = [[t('f_q_majors'), lb.majors], [lang === 'ar' ? 'الجامعات' : 'Universities', lb.universities || lb.uni_target], [t('f_q_intake'), lb.intake], [t('f_q_degree'), lb.degree], [t('f_q_mode'), lb.consult_mode]].filter((r) => r[1]);
  const booking = C.settings.booking_url;
  $('#fprog').style.width = '100%';
  $('#steplabel').textContent = '';
  $('#leadform').innerHTML = `<div class="success">
    <span class="success__badge">${icon('check', 34)}</span>
    <h3>${esc(t('ok_title', { name: F.name.split(' ')[0] }))}</h3>
    <p>${esc(t('ok_body', { id, hours: C.settings.response_promise_hours || '24' }))}</p>
    ${result.preview ? `<p class="note note--warn">${esc(t('ok_preview'))}</p>` : ''}
    <div class="success__cta">
      ${booking ? `<a class="btn btn--gold btn--lg" href="${esc(booking)}" target="_blank" rel="noopener">${icon('cal', 20)}${esc(t('ok_book'))}</a>` : ''}
      ${waLink(id, result.whatsapp) ? `<a class="btn ${booking ? 'btn--ghost' : 'btn--gold'} btn--lg" href="${waLink(id, result.whatsapp)}" target="_blank" rel="noopener">${icon('wa', 20)}${esc(t('ok_wa'))}</a>` : ''}
    </div>
    <div class="summary"><p class="mini">${esc(t('ok_summary'))}</p><dl>${rows.map(([a, b]) => `<div><dt>${esc(a)}</dt><dd>${esc(b)}</dd></div>`).join('')}</dl></div>
  </div>`;
  if (world) world.morph('cap', sceneOpts(SCENES.find((s) => s.id === 's6')));
}

/* ---------------- Privacy, consent and measurement ---------------- */
function openPrivacy() {
  const d = $('#privacy');
  d.innerHTML = `<div class="privacy__in"><h2>${esc(t('privacy_title'))}</h2><p>${esc(t('privacy_body'))}</p><button type="button" class="btn btn--gold" data-close>${esc(t('privacy_close'))}</button></div>`;
  d.querySelector('[data-close]').addEventListener('click', () => d.close());
  d.addEventListener('click', (e) => { if (e.target === d) d.close(); }, { once: true });
  if (d.showModal) d.showModal(); else d.setAttribute('open', '');
}

let pixelsOn = false;
function loadScript(src) { const s = document.createElement('script'); s.async = true; s.src = src; document.head.appendChild(s); }
function startPixels() {
  if (pixelsOn) return; pixelsOn = true;
  const s = C.settings;
  if (s.ga4_id) { loadScript('https://www.googletagmanager.com/gtag/js?id=' + encodeURIComponent(s.ga4_id)); window.dataLayer = window.dataLayer || []; window.gtag = function () { window.dataLayer.push(arguments); }; window.gtag('js', new Date()); window.gtag('config', s.ga4_id); }
  if (s.meta_pixel_id) { /* eslint-disable */ !function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js'); window.fbq('init', s.meta_pixel_id); window.fbq('track', 'PageView'); }
  if (s.snap_pixel_id) { (function(e,t,n){if(e.snaptr)return;var a=e.snaptr=function(){a.handleRequest?a.handleRequest.apply(a,arguments):a.queue.push(arguments)};a.queue=[];var s='script';var r=t.createElement(s);r.async=!0;r.src=n;var u=t.getElementsByTagName(s)[0];u.parentNode.insertBefore(r,u);})(window,document,'https://sc-static.net/scevent.min.js'); window.snaptr('init', s.snap_pixel_id); window.snaptr('track', 'PAGE_VIEW'); }
}
function track(ev) {
  if (!pixelsOn) return;
  try { if (window.gtag) window.gtag('event', 'generate_lead'); if (window.fbq) window.fbq('track', ev); if (window.snaptr) window.snaptr('track', 'SIGN_UP'); } catch (_) { /* ignore */ }
}
function consentBar() {
  const s = C.settings; const el = $('#consent');
  if (!(s.ga4_id || s.meta_pixel_id || s.snap_pixel_id)) { el.hidden = true; return; }
  const v = store.get('rihla_consent');
  if (v === 'yes') { startPixels(); el.hidden = true; return; }
  if (v === 'no') { el.hidden = true; return; }
  el.hidden = false;
  el.innerHTML = `<p>${esc(t('consent_text'))}</p><div><button type="button" class="btn btn--ghost btn--sm" data-c="no">${esc(t('consent_no'))}</button><button type="button" class="btn btn--gold btn--sm" data-c="yes">${esc(t('consent_yes'))}</button></div>`;
  el.onclick = (e) => { const b = e.target.closest('[data-c]'); if (!b) return; store.set('rihla_consent', b.dataset.c); el.hidden = true; if (b.dataset.c === 'yes') startPixels(); };
}

/* ---------------- Scroll story ---------------- */
let world = null, triggers = [];
function sceneOpts(s) {
  const side = lang === 'ar' ? -1 : 1;
  const m = isMobile();
  const base = m ? { x: 0, y: s.id === 'start' || s.id === 'team' ? 0 : 1.75, scale: 0.6, opacity: s.id === 'start' ? 0.45 : 0.85 }
    : { x: side * 2.75, y: 0, scale: 1, opacity: 0.95 };
  if (!m && (s.id === 'start' || s.id === 'team')) Object.assign(base, { x: 0, opacity: 0.5, scale: 1.25 });
  if (s.id === 'hero' && !m) base.scale = 1.05;
  if (s.id === 'hero' && m) Object.assign(base, { y: 1.55, scale: 0.68 });
  return Object.assign(base, { mode: s.mode, yaw: s.yaw || 0, flipX: s.shape === 'car' && lang === 'en' ? -1 : 1 });
}
let currentId = '';
function setActive(s) {
  currentId = s.id;
  if (world) world.morph(s.shape, sceneOpts(s));
  $$('[data-rail]').forEach((a) => a.classList.toggle('on', a.dataset.rail === s.id));
  document.body.dataset.scene = s.id;
  document.body.dataset.rail = s.st ? 'on' : 'off';
}

// The one rule for the 3D story: the section under the middle of the screen decides the shape.
function sectionAtCentre() {
  // At the very bottom the form can't reach the middle of the screen, but it is what the visitor is looking at.
  if (window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 4) {
    const last = SCENES[SCENES.length - 1]; if (document.getElementById(last.id)) return last;
  }
  const y = window.innerHeight / 2;
  let best = null, bestD = Infinity;
  for (const s of SCENES) {
    const el = document.getElementById(s.id); if (!el) continue;
    const r = el.getBoundingClientRect();
    if (r.top <= y && r.bottom > y) return s;
    const d = Math.min(Math.abs(r.top - y), Math.abs(r.bottom - y));
    if (d < bestD) { bestD = d; best = s; }
  }
  return best;
}
function syncScene(force = false) {
  const s = sectionAtCentre();
  if (s && (force || s.id !== currentId)) setActive(s);
  // Phone CTA: visible once the hero is behind you, hidden again when the form itself is on screen.
  const hero = $('#hero'), form = $('#start'), cta = $('#mobile-cta');
  if (hero && form && cta) {
    const vh = window.innerHeight;
    cta.classList.toggle('show', hero.getBoundingClientRect().bottom < vh * 0.8 && form.getBoundingClientRect().top > vh * 0.9);
  }
}
let syncQueued = false;
function queueSync() { if (syncQueued) return; syncQueued = true; requestAnimationFrame(() => { syncQueued = false; syncScene(); }); }

function setupScroll() {
  triggers.forEach((tr) => tr.kill()); triggers = [];
  const ST = window.ScrollTrigger;
  if (!ST || !window.gsap) { $$('.reveal').forEach((el) => el.classList.add('in')); return; }
  window.gsap.registerPlugin(ST);
  const side = lang === 'ar' ? -1 : 1;
  const car = $('#s2');
  if (car) triggers.push(ST.create({ trigger: car, start: 'top bottom', end: 'bottom top', onUpdate: (self) => { if (world && !isMobile()) world.drive(-side * (1 - self.progress * 2) * 1.6); } }));
  const s4 = $('#s4');
  if (s4) triggers.push(ST.create({ trigger: s4, start: 'top 70%', end: 'bottom 30%', onUpdate: (self) => { if (world) world.fly(self.progress); s4.style.setProperty('--fly', self.progress.toFixed(3)); } }));
  const s3 = $('#s3');
  if (s3) triggers.push(ST.create({ trigger: s3, start: 'top 65%', end: 'bottom 55%', onUpdate: (self) => s3.style.setProperty('--fill', self.progress.toFixed(3)) }));
  $$('.reveal').forEach((el) => {
    if (reduced) { el.classList.add('in'); return; }
    triggers.push(ST.create({ trigger: el, start: 'top 85%', once: true, onEnter: () => el.classList.add('in') }));
  });
  ST.refresh();
}

/* ---------------- Page assembly ---------------- */
function render() {
  document.documentElement.lang = lang;
  document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
  document.title = lang === 'ar' ? 'رحلة ماليزيا · ادرس في ماليزيا مع مستشاري Pioneer الرياض' : 'Malaysia Journey · Study in Malaysia with Pioneer consultants in Riyadh';
  $('#site-header').innerHTML = header();
  $('#rail').innerHTML = rail();
  $('#rail').setAttribute('aria-label', lang === 'ar' ? 'محطات الرحلة' : 'Journey stops');
  $('#main').innerHTML = `<span id="top"></span>${heroHtml()}${s1Html()}${s2Html()}${s3Html()}${s4Html()}${s5Html()}${s6Html()}${parentsHtml()}${teamHtml()}${formShell()}`;
  $('#site-footer').innerHTML = footerHtml();
  $('#mobile-cta').innerHTML = `<a class="btn btn--gold" href="#start">${icon('cal', 18)}${esc(t('hero_cta'))}</a>`;
  const firstType = C.universityTypes[0];
  if (firstType) $('#typepanel').innerHTML = typePanel(firstType.id);
  if (F.step >= STEP_COUNT) F.step = 0;
  renderForm();
  setupScroll();
  consentBar();
}

function bind() {
  document.addEventListener('click', (e) => {
    if (e.target.closest('[data-lang]')) {
      // Stay on the same section, at the same point inside it, after the page re-renders in the other language.
      const here = sectionAtCentre(), el = here && document.getElementById(here.id);
      const frac = el ? (window.innerHeight / 2 - el.getBoundingClientRect().top) / Math.max(1, el.offsetHeight) : 0;
      lang = lang === 'ar' ? 'en' : 'ar'; store.set('rihla_lang', lang);
      render();
      const el2 = here && document.getElementById(here.id);
      if (el2) window.scrollTo(0, el2.getBoundingClientRect().top + window.scrollY + frac * el2.offsetHeight - window.innerHeight / 2);
      if (window.ScrollTrigger) window.ScrollTrigger.update();
      syncScene(true);
      return;
    }
    const tab = e.target.closest('.tab');
    if (tab) { $$('.tab').forEach((x) => x.setAttribute('aria-selected', String(x === tab))); $('#typepanel').innerHTML = typePanel(tab.dataset.type); return; }
    if (e.target.closest('[data-privacy]') && !e.target.closest('#leadform')) { openPrivacy(); return; }
    if (e.target.closest('#leadform')) onFormClick(e);
  });
  document.addEventListener('input', (e) => { if (e.target.closest('#leadform')) onFormInput(e); });
  document.addEventListener('change', (e) => { if (e.target.closest('#leadform') && e.target.type === 'checkbox') onFormInput(e); });
  document.addEventListener('submit', (e) => { if (e.target.id === 'leadform') submit(e); });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.target.closest('#leadform') && e.target.tagName === 'INPUT' && F.step < STEP_COUNT - 1) { e.preventDefault(); next(); }
  });
  window.addEventListener('scroll', queueSync, { passive: true });
  let w = window.innerWidth, h = window.innerHeight;
  window.addEventListener('resize', () => {
    if (Math.abs(window.innerWidth - w) < 40 && Math.abs(window.innerHeight - h) < 120) return;
    w = window.innerWidth; h = window.innerHeight;
    syncScene(true);
  });
  window.addEventListener('hashchange', () => setTimeout(() => syncScene(), 60));
}

// A saved draft may point at items the sheet has since hidden: drop them so they are never sent.
function pruneDraft() {
  const has = (list, id) => list.some((x) => x.id === id);
  F.groups = F.groups.filter((g) => has(C.majorGroups, g));
  F.majors = F.majors.filter((m) => has(C.majors, m));
  F.unis = F.unis.filter((u) => has(C.universities, u));
  ['who', 'stage', 'degree', 'grades', 'english', 'budget', 'intake', 'recognition', 'funding', 'city', 'mode', 'time'].forEach((k) => {
    const list = { mode: 'mode', time: 'time' }[k] || k;
    if (F[k] && !C.options.some((o) => o.list === list && o.id === F[k])) F[k] = '';
  });
  if (F.consultant && F.consultant !== 'any' && !has(C.team, F.consultant)) F.consultant = '';
}

async function boot() {
  $('#preloader-text').textContent = t('loading');
  await loadConfig();
  pruneDraft();
  render();
  bind();
  const canvas = $('#world');
  world = createWorld(canvas, { reduced });
  window.__rihla = { debug: () => (world ? world.debug() : null), scene: () => document.body.dataset.scene, lang: () => lang };
  syncScene(true);
  const pre = $('#preloader');
  pre.classList.add('done');
  setTimeout(() => pre.remove(), 900);
  if (location.hash) { const el = document.getElementById(location.hash.slice(1)); if (el) setTimeout(() => { el.scrollIntoView(); syncScene(true); }, 50); }
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
