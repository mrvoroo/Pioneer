/**
 * Rihla Malaysia: the Google Sheet is both the leads database and the site's control panel.
 *
 * - doGet  ?action=config  -> the site reads texts, universities, majors, options, team and public settings.
 * - doPost (lead JSON)     -> one new row in "Leads", a lead score, an assigned consultant and an email alert.
 * - Rows marked "مخفي" in the "visible" column disappear from the site within a few minutes.
 *
 * First run: open Extensions > Apps Script, paste this file, run setup() once, then Deploy > New deployment >
 * Web app (Execute as: Me, Who has access: Anyone). Paste the web-app URL into assets/js/config.js.
 */

const SHOW = 'ظاهر';
const HIDE = 'مخفي';
const YES = 'نعم';
const NO = 'لا';
const CACHE_KEY = 'rihla_config_v1';
const CACHE_SECONDS = 300;

const LEAD_STATUSES = ['جديد', 'تم التواصل', 'لم يرد', 'استشارة محجوزة', 'تمت الاستشارة', 'جمع الأوراق', 'تم التقديم', 'قبول مبدئي', 'سجّل ودفع', 'غير مهتم'];
const SCORES = ['ساخن', 'دافئ', 'بارد'];

// Stable column keys: the CRM syncs on these, so add new columns at the end and never rename.
const LEAD_COLUMNS = [
  ['lead_id', 'رقم الطلب'], ['created_at', 'تاريخ التسجيل'], ['status', 'الحالة'], ['assigned_to', 'المستشار المسؤول'],
  ['score', 'التقييم'], ['score_points', 'نقاط التقييم'], ['next_followup', 'موعد المتابعة القادم'], ['notes', 'ملاحظات'],
  ['who', 'مين عبّى النموذج'], ['full_name', 'الاسم'], ['student_name', 'اسم الطالب'], ['phone', 'الجوال'], ['whatsapp', 'واتساب'],
  ['email', 'البريد'], ['city', 'المدينة'], ['stage', 'المرحلة'], ['degree', 'الدرجة المطلوبة'], ['grades', 'النسبة'],
  ['english', 'الإنجليزي'], ['major_groups', 'المجالات'], ['majors', 'التخصصات'], ['uni_target', 'عنده جامعة معينة'],
  ['universities', 'الجامعات'], ['budget', 'الميزانية'], ['intake', 'موعد البدء'], ['recognition', 'أهمية المعادلة'],
  ['funding', 'التمويل'], ['consult_mode', 'طريقة الاستشارة'], ['best_time', 'أفضل وقت'], ['preferred_consultant', 'المستشار المفضّل'],
  ['lang', 'لغة الموقع'], ['utm_source', 'المصدر'], ['utm_medium', 'الوسيط'], ['utm_campaign', 'الحملة'], ['utm_content', 'محتوى الإعلان'],
  ['ref', 'رمز الإحالة'], ['landing_page', 'صفحة الدخول'], ['referrer', 'الموقع المحيل'], ['device', 'الجهاز'],
  ['consent', 'الموافقة'], ['consent_at', 'وقت الموافقة'], ['updated_at', 'آخر تحديث'], ['raw_json', 'البيانات الخام']
];

// The config tabs: [sheet name, columns, Arabic description]. Seed rows come from the site's content.js.
const CONFIG_SHEETS = {
  Settings: { cols: ['key', 'value', 'description'], note: 'إعدادات عامة: رقم الواتساب، الإيميل، رابط الحجز، أكواد التتبع.' },
  Texts: { cols: ['key', 'ar', 'en'], note: 'كل نصوص الموقع بالعربي والإنجليزي. عدّل النص، وما تغيّر عمود key.' },
  UniversityTypes: { cols: ['id', 'ar', 'en', 'desc_ar', 'desc_en', 'cost_ar', 'cost_en', 'fit_ar', 'fit_en', 'visible', 'order'], note: 'أنواع الجامعات في قسم «الجامعة».' },
  Universities: { cols: ['id', 'short', 'name_ar', 'name_en', 'type', 'badge_ar', 'badge_en', 'visible', 'order'], note: 'الجامعات في الموقع والنموذج. type لازم يكون واحد من: public, glc, private, branch.' },
  MajorGroups: { cols: ['id', 'ar', 'en', 'icon', 'visible', 'order'], note: 'المجالات الكبيرة (الهندسة، الطب…).' },
  Majors: { cols: ['id', 'group', 'ar', 'en', 'visible', 'order'], note: 'التخصصات تحت كل مجال. group = id المجال.' },
  Options: { cols: ['list', 'id', 'ar', 'en', 'visible', 'order'], note: 'خيارات أسئلة النموذج (الميزانية، مواعيد البدء، المدن…).' },
  Team: { cols: ['id', 'name_ar', 'name_en', 'role_ar', 'role_en', 'whatsapp', 'email', 'receives_leads', 'visible', 'order'], note: 'فريقك. receives_leads = نعم يعني يستلم عملاء بالتناوب.' }
};
const PUBLIC_SETTINGS = ['whatsapp_number', 'booking_url', 'office_map_url', 'instagram_url', 'youtube_url', 'snapchat_url', 'tiktok_url', 'ga4_id', 'meta_pixel_id', 'snap_pixel_id', 'response_promise_hours'];
const SETTING_NOTES = {
  whatsapp_number: 'رقم الواتساب اللي يستقبل العملاء، بالصيغة الدولية بدون + (مثال 9665XXXXXXXX)',
  notify_emails: 'الإيميلات اللي يوصلها تنبيه بكل عميل جديد، افصل بينها بفاصلة (خاص، ما يظهر في الموقع)',
  booking_url: 'رابط حجز المواعيد (Google Calendar أو Calendly). لو فاضي يختفي زر الحجز',
  office_map_url: 'رابط موقع المكتب على الخريطة',
  instagram_url: 'رابط إنستجرام', youtube_url: 'رابط يوتيوب', snapchat_url: 'رابط سناب شات', tiktok_url: 'رابط تيك توك',
  ga4_id: 'Google Analytics 4 (G-XXXX)', meta_pixel_id: 'Meta Pixel ID', snap_pixel_id: 'Snap Pixel ID',
  response_promise_hours: 'خلال كم ساعة نوعد العميل نتواصل معه'
};

const SEED = /*__SEED__*/ {};

/* ------------------------------------------------------------------ */
/* Menu and triggers                                                   */
/* ------------------------------------------------------------------ */
function onOpen() {
  SpreadsheetApp.getUi().createMenu('🎓 الموقع')
    .addItem('تجهيز الشيت (أول مرة فقط)', 'setup')
    .addItem('حدّث الموقع الآن', 'clearSiteCache')
    .addItem('أرسل إيميل تجربة', 'testEmail')
    .addToUi();
}

function onEdit(e) {
  try {
    const sh = e.range.getSheet(), name = sh.getName();
    if (CONFIG_SHEETS[name]) { CacheService.getScriptCache().remove(CACHE_KEY); return; }
    if (name === 'Leads' && e.range.getRow() > 1) {
      const col = headerIndex_(sh)['updated_at'];
      if (col && e.range.getColumn() !== col) sh.getRange(e.range.getRow(), col, e.range.getNumRows(), 1).setValue(new Date());
    }
  } catch (err) { /* never block an edit */ }
}

function clearSiteCache() {
  CacheService.getScriptCache().remove(CACHE_KEY);
  SpreadsheetApp.getActive().toast('تم. الموقع بيسحب التعديلات الجديدة خلال دقائق.', 'الموقع', 5);
}

/* ------------------------------------------------------------------ */
/* Web app                                                             */
/* ------------------------------------------------------------------ */
function doGet(e) {
  const action = (e && e.parameter && e.parameter.action) || 'config';
  if (action === 'ping') return json_({ ok: true, time: new Date().toISOString() });
  const cache = CacheService.getScriptCache();
  const hit = cache.get(CACHE_KEY);
  if (hit) return ContentService.createTextOutput(hit).setMimeType(ContentService.MimeType.JSON);
  const cfg = buildConfig_();
  const body = JSON.stringify(cfg);
  if (body.length < 90000) cache.put(CACHE_KEY, body, CACHE_SECONDS);
  return ContentService.createTextOutput(body).setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  let data;
  try { data = JSON.parse(e.postData.contents); } catch (err) { return json_({ ok: false, error: 'bad_json' }); }
  if (data.hp) return json_({ ok: true, id: data.lead_id || '' }); // bot trap: pretend success, store nothing
  const name = String(data.full_name || '').trim(), phone = String(data.phone || '').replace(/\D/g, '');
  if (name.length < 2 || phone.length < 8 || !data.consent) return json_({ ok: false, error: 'invalid' });

  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    const ss = SpreadsheetApp.getActive();
    const sh = ss.getSheetByName('Leads') || setupLeads_(ss);
    const idx = headerIndex_(sh);
    let id = String(data.lead_id || '').replace(/[^A-Za-z0-9-]/g, '').slice(0, 24) || makeId_();
    // The same submission sent twice (double tap, retry) keeps one row.
    if (sh.getLastRow() > 1) {
      const ids = sh.getRange(2, idx.lead_id, sh.getLastRow() - 1, 1).getValues().map((r) => String(r[0]));
      if (ids.indexOf(id) !== -1) return json_({ ok: true, id: id, duplicate: true });
    }
    const team = readRows_(ss, 'Team').filter((m) => m.visible !== HIDE);
    const assigned = assign_(team, data.preferred_consultant);
    const scored = score_(data);
    const lb = data.labels || {};
    const now = new Date();
    const row = {
      lead_id: id, created_at: now, status: LEAD_STATUSES[0], assigned_to: assigned ? assigned.name_ar : '',
      score: scored.label, score_points: scored.points, next_followup: '', notes: '',
      who: lb.who || data.who, full_name: name, student_name: data.student_name || '', phone: '+' + phone,
      whatsapp: data.whatsapp ? '+' + String(data.whatsapp).replace(/\D/g, '') : '', email: data.email || '', city: lb.city || data.city,
      stage: lb.stage || data.stage, degree: lb.degree || data.degree, grades: lb.grades || data.grades, english: lb.english || data.english,
      major_groups: lb.major_groups || (data.major_groups || []).join(', '), majors: lb.majors || (data.majors || []).join(', '),
      uni_target: lb.uni_target || data.uni_target, universities: lb.universities || (data.universities || []).join(', '),
      budget: lb.budget || data.budget, intake: lb.intake || data.intake, recognition: lb.recognition || data.recognition,
      funding: lb.funding || data.funding, consult_mode: lb.consult_mode || data.consult_mode, best_time: lb.best_time || data.best_time,
      preferred_consultant: lb.preferred_consultant || data.preferred_consultant, lang: data.lang,
      utm_source: data.utm_source, utm_medium: data.utm_medium, utm_campaign: data.utm_campaign, utm_content: data.utm_content,
      ref: data.ref, landing_page: data.landing_page, referrer: data.referrer, device: data.device,
      consent: YES, consent_at: data.consent_at, updated_at: now,
      raw_json: JSON.stringify(stripLabels_(data)).slice(0, 45000)
    };
    const width = sh.getLastColumn();
    const values = new Array(width).fill('');
    Object.keys(row).forEach((k) => { if (idx[k]) values[idx[k] - 1] = safe_(row[k]); });
    sh.appendRow(values);
    try { notify_(ss, row, assigned); } catch (err) { console.error('notify failed', err); }
    const settings = readSettings_(ss);
    return json_({ ok: true, id: id, score: scored.label, whatsapp: (assigned && assigned.whatsapp) || settings.whatsapp_number || '' });
  } finally {
    lock.releaseLock();
  }
}

/* ------------------------------------------------------------------ */
/* Lead logic                                                          */
/* ------------------------------------------------------------------ */
function score_(d) {
  const pts = { intake: { '2027_02': 30, '2027_09': 22, '2028': 8, unsure: 5 },
    budget: { '60p': 20, '35_60': 18, '20_35': 14, lt20: 6, unknown: 4 },
    who: { parent: 10, graduate: 8, student: 5 },
    grades: { '90p': 10, '80_89': 8, '70_79': 5, lt70: 2, na: 4 },
    english: { ielts6: 8, ielts55: 6, good: 4, weak: 2 },
    consult_mode: { office: 5, online: 4, call: 3, whatsapp: 2 },
    stage: { g12: 5, hs_grad: 5, bachelor: 5, uni_student: 4, master: 4, g11: 1 } };
  let p = 0;
  Object.keys(pts).forEach((k) => { p += pts[k][d[k]] || 0; });
  if (d.uni_target === 'yes') p += 6;
  if (d.email) p += 3;
  // Any intake id that is not in the table (new intakes added in the sheet) counts as "soon".
  if (d.intake && pts.intake[d.intake] === undefined) p += 20;
  const label = p >= 65 ? SCORES[0] : p >= 40 ? SCORES[1] : SCORES[2];
  return { points: p, label: label };
}

function assign_(team, preferred) {
  const pool = team.filter((m) => m.receives_leads === true);
  if (preferred && preferred !== 'any') {
    const m = team.find((x) => x.id === preferred);
    if (m) return m;
  }
  if (!pool.length) return null;
  const props = PropertiesService.getScriptProperties();
  const n = Number(props.getProperty('rr') || 0);
  props.setProperty('rr', String(n + 1));
  return pool[n % pool.length];
}

function notify_(ss, row, assigned) {
  const settings = readSettings_(ss);
  const to = String(settings.notify_emails || '').split(/[,;\s]+/).filter(Boolean);
  if (assigned && assigned.email) to.push(assigned.email);
  const uniq = to.filter((x, i) => to.indexOf(x) === i);
  if (!uniq.length) return;
  const wa = String(row.whatsapp || row.phone).replace(/\D/g, '');
  const flame = row.score === SCORES[0] ? '🔥 ' : row.score === SCORES[1] ? '⭐ ' : '';
  const fields = [['رقم الطلب', row.lead_id], ['التقييم', row.score + ' (' + row.score_points + ')'], ['المستشار', row.assigned_to], ['مين عبّى', row.who],
    ['الاسم', row.full_name], ['اسم الطالب', row.student_name], ['الجوال', row.phone], ['البريد', row.email], ['المدينة', row.city],
    ['المرحلة', row.stage], ['الدرجة', row.degree], ['النسبة', row.grades], ['الإنجليزي', row.english], ['التخصصات', row.majors],
    ['الجامعات', row.universities || row.uni_target], ['الميزانية', row.budget], ['موعد البدء', row.intake], ['المعادلة', row.recognition],
    ['طريقة الاستشارة', row.consult_mode], ['أفضل وقت', row.best_time], ['المصدر', [row.utm_source, row.utm_campaign, row.ref].filter(String).join(' · ')]]
    .filter((f) => f[1]);
  const html = '<div dir="rtl" style="font-family:Tahoma,Arial;font-size:14px">' +
    '<h2 style="margin:0 0 12px">' + flame + 'عميل جديد: ' + esc_(row.full_name) + '</h2>' +
    '<p><a href="https://wa.me/' + wa + '" style="background:#25D366;color:#fff;padding:8px 14px;border-radius:8px;text-decoration:none">كلّمه على واتساب</a> ' +
    '&nbsp; <a href="' + ss.getUrl() + '">افتح الشيت</a></p>' +
    '<table cellpadding="6" style="border-collapse:collapse">' +
    fields.map((f) => '<tr><td style="color:#666;border-bottom:1px solid #eee">' + esc_(f[0]) + '</td><td style="border-bottom:1px solid #eee"><b>' + esc_(f[1]) + '</b></td></tr>').join('') +
    '</table></div>';
  MailApp.sendEmail({ to: uniq.join(','), subject: flame + 'عميل جديد (' + row.score + '): ' + row.full_name + ' · ' + (row.majors || ''), htmlBody: html, name: 'رحلة ماليزيا' });
}

function testEmail() {
  const ss = SpreadsheetApp.getActive();
  notify_(ss, { lead_id: 'TEST', score: SCORES[0], score_points: 80, assigned_to: 'تجربة', who: 'ولي أمر', full_name: 'عميل تجريبي', phone: '+966500000000', majors: 'هندسة ميكانيكية', intake: 'سبتمبر 2027' }, null);
  ss.toast('أرسلنا إيميل تجربة للعناوين في Settings → notify_emails', 'الموقع', 6);
}

/* ------------------------------------------------------------------ */
/* Config for the site                                                 */
/* ------------------------------------------------------------------ */
function buildConfig_() {
  const ss = SpreadsheetApp.getActive();
  const visible = (rows) => rows.filter((r) => r.visible !== HIDE).sort((a, b) => (Number(a.order) || 0) - (Number(b.order) || 0));
  const strip = (rows, keys) => rows.map((r) => { const o = {}; keys.forEach((k) => { if (r[k] !== '' && r[k] !== undefined) o[k] = r[k]; }); return o; });
  const settings = readSettings_(ss), pub = {};
  PUBLIC_SETTINGS.forEach((k) => { if (settings[k] !== undefined) pub[k] = String(settings[k]); });
  const texts = {};
  readRows_(ss, 'Texts').forEach((r) => { if (r.key) texts[r.key] = { ar: String(r.ar || ''), en: String(r.en || '') }; });
  const groups = visible(readRows_(ss, 'MajorGroups'));
  const groupIds = groups.map((g) => g.id);
  const types = visible(readRows_(ss, 'UniversityTypes'));
  const typeIds = types.map((t) => t.id);
  return {
    ok: true,
    settings: pub,
    texts: texts,
    universityTypes: strip(types, ['id', 'ar', 'en', 'desc_ar', 'desc_en', 'cost_ar', 'cost_en', 'fit_ar', 'fit_en']),
    universities: strip(visible(readRows_(ss, 'Universities')).filter((u) => typeIds.indexOf(u.type) !== -1), ['id', 'short', 'name_ar', 'name_en', 'type', 'badge_ar', 'badge_en']),
    majorGroups: strip(groups, ['id', 'ar', 'en', 'icon']),
    majors: strip(visible(readRows_(ss, 'Majors')).filter((m) => groupIds.indexOf(m.group) !== -1), ['id', 'group', 'ar', 'en']),
    options: strip(visible(readRows_(ss, 'Options')), ['list', 'id', 'ar', 'en']),
    team: visible(readRows_(ss, 'Team')).map((m) => ({ id: m.id, name_ar: m.name_ar, name_en: m.name_en, role_ar: m.role_ar, role_en: m.role_en, whatsapp: String(m.whatsapp || ''), receives_leads: m.receives_leads === true }))
  };
}

function readRows_(ss, name) {
  const sh = ss.getSheetByName(name);
  if (!sh || sh.getLastRow() < 2) return [];
  const vals = sh.getRange(1, 1, sh.getLastRow(), sh.getLastColumn()).getValues();
  const head = vals[0].map((h) => String(h).trim());
  return vals.slice(1).filter((r) => String(r[0]).trim() !== '').map((r) => {
    const o = {};
    head.forEach((h, i) => { if (h) o[h] = typeof r[i] === 'string' ? r[i].trim() : r[i]; });
    if ('receives_leads' in o) o.receives_leads = o.receives_leads === YES || o.receives_leads === true;
    if ('id' in o) o.id = String(o.id).trim();
    return o;
  });
}

function readSettings_(ss) {
  const out = {};
  readRows_(ss, 'Settings').forEach((r) => { if (r.key) out[r.key] = r.value === undefined ? '' : String(r.value); });
  return out;
}

/* ------------------------------------------------------------------ */
/* Setup: creates and formats every tab                                */
/* ------------------------------------------------------------------ */
function setup() {
  const ss = SpreadsheetApp.getActive();
  setupReadme_(ss);
  setupLeads_(ss);
  Object.keys(CONFIG_SHEETS).forEach((name) => setupConfig_(ss, name));
  const first = ss.getSheetByName('Sheet1') || ss.getSheetByName('ورقة1');
  if (first && first.getLastRow() === 0 && ss.getSheets().length > 1) ss.deleteSheet(first);
  ss.setActiveSheet(ss.getSheetByName('Leads'));
  clearSiteCache();
  SpreadsheetApp.getUi().alert('تم تجهيز الشيت ✅\n\nالخطوة الجاية: Deploy ← New deployment ← Web app\nExecute as: Me · Who has access: Anyone\nوانسخ رابط الـ Web app في ملف assets/js/config.js');
}

function setupLeads_(ss) {
  let sh = ss.getSheetByName('Leads');
  if (!sh) sh = ss.insertSheet('Leads', 0);
  sh.setRightToLeft(true);
  const keys = LEAD_COLUMNS.map((c) => c[0]);
  if (sh.getLastRow() === 0) {
    sh.getRange(1, 1, 1, keys.length).setValues([keys]);
  } else {
    const have = headerIndex_(sh), missing = keys.filter((k) => !have[k]);
    if (missing.length) sh.getRange(1, sh.getLastColumn() + 1, 1, missing.length).setValues([missing]);
  }
  const idx = headerIndex_(sh);
  const head = sh.getRange(1, 1, 1, sh.getLastColumn());
  head.setFontWeight('bold').setBackground('#0b1026').setFontColor('#f5b942').setWrap(false);
  LEAD_COLUMNS.forEach((c) => sh.getRange(1, idx[c[0]]).setNote(c[1]));
  sh.setFrozenRows(1);
  sh.setFrozenColumns(1);
  const rows = Math.max(sh.getMaxRows() - 1, 999);
  const dv = (list) => SpreadsheetApp.newDataValidation().requireValueInList(list, true).setAllowInvalid(false).build();
  sh.getRange(2, idx.status, rows, 1).setDataValidation(dv(LEAD_STATUSES));
  sh.getRange(2, idx.score, rows, 1).setDataValidation(dv(SCORES));
  const names = readRows_(ss, 'Team').map((m) => m.name_ar).filter(String);
  if (names.length) sh.getRange(2, idx.assigned_to, rows, 1).setDataValidation(dv(names.concat(['غير محدد'])));
  sh.getRange(2, idx.next_followup, rows, 1).setDataValidation(SpreadsheetApp.newDataValidation().requireDate().setAllowInvalid(true).build()).setNumberFormat('yyyy-mm-dd');
  ['created_at', 'updated_at'].forEach((k) => sh.getRange(2, idx[k], rows, 1).setNumberFormat('yyyy-mm-dd hh:mm'));
  const rules = [];
  const colorize = (col, text, bg, fg) => rules.push(SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo(text).setBackground(bg).setFontColor(fg).setRanges([sh.getRange(2, col, rows, 1)]).build());
  colorize(idx.score, 'ساخن', '#ffd6cc', '#a12a00'); colorize(idx.score, 'دافئ', '#fff1c2', '#7a5300'); colorize(idx.score, 'بارد', '#e6e9f2', '#4a5470');
  colorize(idx.status, 'جديد', '#dff3ff', '#004b75'); colorize(idx.status, 'سجّل ودفع', '#d6f5e3', '#0b6b35'); colorize(idx.status, 'غير مهتم', '#eeeeee', '#777777');
  colorize(idx.status, 'استشارة محجوزة', '#efe4ff', '#4b2a8a');
  sh.setConditionalFormatRules(rules);
  sh.setColumnWidths(1, sh.getLastColumn(), 140);
  sh.setColumnWidth(idx.raw_json, 80);
  sh.setColumnWidth(idx.notes, 240);
  const prot = sh.getRange(1, 1, 1, sh.getLastColumn()).protect().setDescription('عناوين الأعمدة: الـ CRM يعتمد عليها');
  prot.setWarningOnly(true);
  return sh;
}

function setupConfig_(ss, name) {
  const spec = CONFIG_SHEETS[name];
  let sh = ss.getSheetByName(name);
  if (!sh) sh = ss.insertSheet(name);
  sh.setRightToLeft(true);
  if (sh.getLastRow() === 0) {
    sh.getRange(1, 1, 1, spec.cols.length).setValues([spec.cols]);
    const rows = seedRows_(name, spec.cols);
    if (rows.length) sh.getRange(2, 1, rows.length, spec.cols.length).setValues(rows);
  }
  sh.getRange(1, 1, 1, sh.getLastColumn()).setFontWeight('bold').setBackground('#0b1026').setFontColor('#f5b942');
  sh.getRange(1, 1).setNote(spec.note);
  sh.setFrozenRows(1);
  const idx = headerIndex_(sh), n = Math.max(sh.getMaxRows() - 1, 500);
  const dv = (list) => SpreadsheetApp.newDataValidation().requireValueInList(list, true).setAllowInvalid(false).build();
  if (idx.visible) {
    sh.getRange(2, idx.visible, n, 1).setDataValidation(dv([SHOW, HIDE]));
    sh.setConditionalFormatRules([SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo(HIDE).setBackground('#f3d6d6').setFontColor('#8a1f1f').setRanges([sh.getRange(2, 1, n, sh.getLastColumn())]).build()]);
  }
  if (idx.receives_leads) sh.getRange(2, idx.receives_leads, n, 1).setDataValidation(dv([YES, NO]));
  if (idx.type && name === 'Universities') sh.getRange(2, idx.type, n, 1).setDataValidation(dv(['public', 'glc', 'private', 'branch']));
  if (idx.group && name === 'Majors') {
    const groups = ss.getSheetByName('MajorGroups');
    if (groups) sh.getRange(2, idx.group, n, 1).setDataValidation(SpreadsheetApp.newDataValidation().requireValueInRange(groups.getRange('A2:A'), true).build());
  }
  if (name === 'Texts') { sh.setColumnWidth(1, 160); sh.setColumnWidths(2, 2, 420); sh.getRange('B:C').setWrap(true); }
  else if (name === 'Settings') { sh.setColumnWidth(1, 200); sh.setColumnWidth(2, 320); sh.setColumnWidth(3, 420); sh.getRange('B:B').setNumberFormat('@'); }
  else sh.setColumnWidths(1, sh.getLastColumn(), 150);
  if (name === 'Team') sh.getRange(2, idx.whatsapp, n, 1).setNumberFormat('@');
}

function seedRows_(name, cols) {
  const order = (arr) => arr.map((o, i) => Object.assign({ visible: SHOW, order: (i + 1) * 10 }, o));
  let list = [];
  if (name === 'Settings') list = Object.keys(SEED.settings).map((k) => ({ key: k, value: SEED.settings[k], description: SETTING_NOTES[k] || '' }));
  else if (name === 'Texts') list = Object.keys(SEED.texts).map((k) => ({ key: k, ar: SEED.texts[k].ar, en: SEED.texts[k].en }));
  else if (name === 'UniversityTypes') list = order(SEED.universityTypes);
  else if (name === 'Universities') list = order(SEED.universities);
  else if (name === 'MajorGroups') list = order(SEED.majorGroups);
  else if (name === 'Majors') list = order(SEED.majors);
  else if (name === 'Options') list = order(SEED.options);
  else if (name === 'Team') list = order(SEED.team).map((m) => Object.assign({}, m, { receives_leads: m.receives_leads ? YES : NO }));
  return list.map((o) => cols.map((c) => (o[c] === undefined || o[c] === null ? '' : o[c])));
}

function setupReadme_(ss) {
  let sh = ss.getSheetByName('اقرأني');
  if (!sh) sh = ss.insertSheet('اقرأني', 0);
  sh.clear();
  sh.setRightToLeft(true);
  const lines = [
    ['رحلة ماليزيا: قاعدة بيانات العملاء ولوحة تحكم الموقع'],
    [''],
    ['Leads: كل عميل يعبّي النموذج ينزل هنا صف جديد. غيّر الحالة والمستشار وموعد المتابعة من القوائم المنسدلة.'],
    ['ما تغيّر أسماء الأعمدة في الصف الأول ولا أسماء التبويبات: الموقع والـ CRM يعتمدون عليها.'],
    [''],
    ['Universities / Majors / MajorGroups / Options / Team / UniversityTypes: كل صف فيه عمود visible.'],
    ['اختر «مخفي» عشان يختفي من الموقع، و«ظاهر» عشان يرجع. عمود order يحدد الترتيب (الأصغر أولًا).'],
    ['تقدر تضيف جامعة أو تخصص جديد: اكتب id جديد بالإنجليزي بدون مسافات، وما تغيّر id موجود.'],
    [''],
    ['Texts: كل نصوص الموقع بالعربي والإنجليزي. عدّل العمودين ar و en فقط.'],
    ['Settings: رقم الواتساب، إيميل التنبيهات، رابط الحجز، أكواد التتبع.'],
    [''],
    ['التعديلات توصل للموقع خلال 5 دقائق تقريبًا. تبي تشوفها فورًا؟ من القائمة: 🎓 الموقع ← حدّث الموقع الآن.'],
    ['تقييم العميل (ساخن / دافئ / بارد) يتحسب تلقائيًا من موعد البدء والميزانية والنسبة والإنجليزي.']
  ];
  sh.getRange(1, 1, lines.length, 1).setValues(lines);
  sh.getRange(1, 1).setFontSize(16).setFontWeight('bold');
  sh.setColumnWidth(1, 900);
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */
function headerIndex_(sh) {
  const out = {};
  if (sh.getLastColumn() === 0) return out;
  sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].forEach((h, i) => { if (h) out[String(h).trim()] = i + 1; });
  return out;
}
function safe_(v) {
  if (v === null || v === undefined) return '';
  if (v instanceof Date || typeof v === 'number') return v;
  const s = String(v).slice(0, 5000);
  return /^[=+\-@]/.test(s) ? "'" + s : s;
}
function stripLabels_(d) { const o = Object.assign({}, d); delete o.labels; delete o.user_agent; return o; }
function makeId_() { return 'R' + Utilities.formatDate(new Date(), 'Asia/Riyadh', 'yyMMdd') + '-' + Math.random().toString(36).slice(2, 6).toUpperCase(); }
function json_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
function esc_(s) { return String(s === undefined || s === null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
