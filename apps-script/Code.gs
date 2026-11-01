/**
 * Study in Malaysia: the Google Sheet is both the leads database and the site's control panel.
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
  ['consent', 'الموافقة'], ['consent_at', 'وقت الموافقة'], ['updated_at', 'آخر تحديث'], ['raw_json', 'البيانات الخام'],
  ['curriculum', 'نظام الشهادة الثانوية']
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
  Team: { cols: ['id', 'name_ar', 'name_en', 'role_ar', 'role_en', 'whatsapp', 'email', 'receives_leads', 'visible', 'order'], note: 'فريقك. receives_leads = نعم يعني يستلم عملاء بالتناوب.' },
  Gallery: { cols: ['id', 'src', 'caption_ar', 'caption_en', 'visible', 'order'], note: 'صور معرض «من رحلات طلابنا». src = رابط مباشر للصورة (يبدأ بـ https).' }
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

const SEED = {
 "settings": {
  "whatsapp_number": "966590873178",
  "notify_emails": "ahmad.a.asalia@gmail.com",
  "booking_url": "",
  "office_map_url": "https://maps.app.goo.gl/RCoKTTszZ73nSS8E8",
  "instagram_url": "https://www.instagram.com/pioneer4ss_sa/",
  "youtube_url": "https://www.youtube.com/@Pioneer4ssRiyadh",
  "snapchat_url": "",
  "tiktok_url": "",
  "ga4_id": "",
  "meta_pixel_id": "",
  "snap_pixel_id": "",
  "response_promise_hours": "24"
 },
 "texts": {
  "brand": {
   "ar": "الدراسة في ماليزيا",
   "en": "Study in Malaysia"
  },
  "brand_sub": {
   "ar": "مستشارو Pioneer · الرياض",
   "en": "Pioneer consultants · Riyadh"
  },
  "nav_journey": {
   "ar": "الرحلة",
   "en": "The journey"
  },
  "nav_unis": {
   "ar": "الجامعات",
   "en": "Universities"
  },
  "nav_parents": {
   "ar": "لولي الأمر",
   "en": "For parents"
  },
  "nav_team": {
   "ar": "فريقك",
   "en": "Your team"
  },
  "nav_cta": {
   "ar": "ابدأ رحلتك",
   "en": "Start your journey"
  },
  "lang_switch": {
   "ar": "EN",
   "en": "عربي"
  },
  "loading": {
   "ar": "نُجهّز رحلتك…",
   "en": "Preparing your journey…"
  },
  "hero_kicker": {
   "ar": "مستشارو الدراسة في ماليزيا · Pioneer الرياض",
   "en": "Study-in-Malaysia advisors · Pioneer Riyadh"
  },
  "hero_title_a": {
   "ar": "من مقاعد الدراسة في الرياض…",
   "en": "From your studies in Riyadh…"
  },
  "hero_title_b": {
   "ar": "إلى جامعة عالمية في ماليزيا.",
   "en": "to a world-class university in Malaysia."
  },
  "hero_sub": {
   "ar": "نرافقك خطوة بخطوة: نختار معك التخصص والجامعة المعترف بها، ونُعدّ أوراقك وتأشيرتك، ونستقبلك في المطار. والاستشارة الأولى مجانية.",
   "en": "We walk with you step by step: the right major and a recognised university, your papers and visa, and a welcome at the airport. The first consultation is free."
  },
  "hero_cta": {
   "ar": "احجز استشارتك المجانية",
   "en": "Book your free consultation"
  },
  "hero_cta2": {
   "ar": "تعرّف على الرحلة",
   "en": "See the journey"
  },
  "stat1_n": {
   "ar": "10+",
   "en": "10+"
  },
  "stat1_l": {
   "ar": "سنوات خبرة",
   "en": "years of experience"
  },
  "stat2_n": {
   "ar": "4,000+",
   "en": "4,000+"
  },
  "stat2_l": {
   "ar": "طالب قُبلوا في جامعات ماليزيا",
   "en": "students admitted to Malaysian universities"
  },
  "stat3_n": {
   "ar": "50+",
   "en": "50+"
  },
  "stat3_l": {
   "ar": "جامعة نحن وكلاء معتمدون لديها",
   "en": "universities we are certified agents for"
  },
  "stat4_n": {
   "ar": "UTM",
   "en": "UTM"
  },
  "stat4_l": {
   "ar": "الوكيل الذهبي للجامعة",
   "en": "Gold Agent of the university"
  },
  "stats_note": {
   "ar": "أرقام Pioneer للخدمات التعليمية",
   "en": "Figures from Pioneer Education Services"
  },
  "scroll_hint": {
   "ar": "مرّر لأسفل لتبدأ الرحلة",
   "en": "Scroll to start the journey"
  },
  "st1": {
   "ar": "المدرسة",
   "en": "School"
  },
  "st2": {
   "ar": "الاستشارة",
   "en": "Consultation"
  },
  "st3": {
   "ar": "التجهيز",
   "en": "Preparation"
  },
  "st4": {
   "ar": "الإقلاع",
   "en": "Take-off"
  },
  "st5": {
   "ar": "الجامعة",
   "en": "University"
  },
  "st6": {
   "ar": "التخرج",
   "en": "Graduation"
  },
  "s1_kicker": {
   "ar": "المحطة 01 · المدرسة",
   "en": "Stop 01 · School"
  },
  "s1_title": {
   "ar": "السنة الأخيرة… وألف سؤال.",
   "en": "Final year… and a thousand questions."
  },
  "s1_body": {
   "ar": "من الطبيعي أن تشعر بالحيرة؛ فالقرار كبير والمعلومات كثيرة ومتضاربة. هذه أسئلة نسمعها كل يوم، ولكلٍّ منها إجابة واضحة.",
   "en": "Feeling lost is normal. It is a big decision and the information out there is messy. We hear these questions every day, and each one has a clear answer."
  },
  "s1_q1": {
   "ar": "أي تخصص يناسبني؟",
   "en": "Which major suits me?"
  },
  "s1_q2": {
   "ar": "أي جامعة أختار؟",
   "en": "Which university should I pick?"
  },
  "s1_q3": {
   "ar": "هل ستُعادَل شهادتي في بلدي؟",
   "en": "Will my degree be recognised back home?"
  },
  "s1_q4": {
   "ar": "ما التكلفة الحقيقية؟",
   "en": "What is the real cost?"
  },
  "s1_q5": {
   "ar": "كيف أُقنع أهلي؟",
   "en": "How do I convince my parents?"
  },
  "s2_kicker": {
   "ar": "المحطة 02 · الطريق إلينا",
   "en": "Stop 02 · On the way to us"
  },
  "s2_title": {
   "ar": "استشارة مجانية، بالطريقة التي تناسبك.",
   "en": "A free consultation, the way that suits you."
  },
  "s2_body": {
   "ar": "في جلسة واحدة تخرج بخطة واضحة: التخصص، وجامعتان أو ثلاث تناسب معدلك وميزانيتك، وتكلفة تقريبية، وموعد البدء.",
   "en": "One session gives you a clear plan: the major, two or three universities that fit your grades and budget, an estimated cost and a start date."
  },
  "s2_m1": {
   "ar": "زيارة مكتبنا في العليا",
   "en": "Visit our office in Olaya"
  },
  "s2_m2": {
   "ar": "اجتماع عبر الإنترنت معك ومع أسرتك",
   "en": "Online meeting with you and your family"
  },
  "s2_m3": {
   "ar": "مكالمة هاتفية",
   "en": "Phone call"
  },
  "s2_m4": {
   "ar": "محادثة واتساب",
   "en": "WhatsApp chat"
  },
  "s3_kicker": {
   "ar": "المحطة 03 · نُجهّزك",
   "en": "Stop 03 · We get you ready"
  },
  "s3_title": {
   "ar": "ملفك مسؤوليتنا، من بدايته إلى نهايته.",
   "en": "Your file is on us, start to finish."
  },
  "s3_body": {
   "ar": "ركّز أنت على اختيارك، ونحن نتابع الأوراق والجامعة والتأشيرة.",
   "en": "You focus on your choice; we handle the paperwork, the university and the visa."
  },
  "s3_p1t": {
   "ar": "الترشيح",
   "en": "Shortlist"
  },
  "s3_p1": {
   "ar": "نرشّح جامعات وتخصصات معتمدة تناسب أهدافك ومعدلك.",
   "en": "Accredited universities and majors that fit your goals and grades."
  },
  "s3_p2t": {
   "ar": "التوثيق",
   "en": "Attestation"
  },
  "s3_p2": {
   "ar": "نساعدك في توثيق شهاداتك، ونتأكد من أن جميع أوراقك سليمة ومكتملة.",
   "en": "We help you attest your certificates and make sure every document is correct and complete."
  },
  "s3_p3t": {
   "ar": "القبول",
   "en": "Admission"
  },
  "s3_p3": {
   "ar": "نتقدّم إلى الجامعة ونتابع الطلب حتى يصلك خطاب القبول.",
   "en": "We apply and follow up until your offer letter arrives."
  },
  "s3_p4t": {
   "ar": "التأشيرة",
   "en": "Visa"
  },
  "s3_p4": {
   "ar": "نتابع ملفك لدى EMGS حتى يصدر خطاب الموافقة على التأشيرة (VAL).",
   "en": "Your file with EMGS until the Visa Approval Letter (VAL) is issued."
  },
  "s4_kicker": {
   "ar": "المحطة 04 · الإقلاع",
   "en": "Stop 04 · Take-off"
  },
  "s4_title": {
   "ar": "من الرياض إلى كوالالمبور… ولن تكون وحدك.",
   "en": "Riyadh to Kuala Lumpur… and never on your own."
  },
  "s4_body": {
   "ar": "نحو 8 ساعات من الطيران، وفور وصولك تجد فريق Pioneer في استقبالك.",
   "en": "About 8 hours in the air, and the Pioneer team is waiting when you land."
  },
  "s4_i1": {
   "ar": "استقبال في المطار",
   "en": "Airport pickup"
  },
  "s4_i2": {
   "ar": "شريحة اتصال ماليزية",
   "en": "Malaysian SIM card"
  },
  "s4_i3": {
   "ar": "المساعدة في إيجاد السكن والتوصيل إليه",
   "en": "Help finding housing, and a ride there"
  },
  "s4_i4": {
   "ar": "المساعدة في التسجيل والفحص الطبي",
   "en": "Help with registration and the medical check"
  },
  "s4_i5": {
   "ar": "فريق Pioneer في ماليزيا يتابعك طوال دراستك",
   "en": "The Pioneer team in Malaysia, with you throughout your studies"
  },
  "s4_from": {
   "ar": "الرياض",
   "en": "Riyadh"
  },
  "s4_to": {
   "ar": "كوالالمبور",
   "en": "Kuala Lumpur"
  },
  "s5_kicker": {
   "ar": "المحطة 05 · الجامعة",
   "en": "Stop 05 · University"
  },
  "s5_title": {
   "ar": "أربعة أنواع من الجامعات… أحدها يناسبك.",
   "en": "Four kinds of university… one of them is yours."
  },
  "s5_body": {
   "ar": "الدراسة باللغة الإنجليزية، والبرامج معتمدة من هيئة المؤهلات الماليزية (MQA). اضغط على النوع لترى الفرق.",
   "en": "Teaching is in English and programmes are accredited by the Malaysian Qualifications Agency (MQA). Tap a type to see the difference."
  },
  "s5_f1n": {
   "ar": "56",
   "en": "56th"
  },
  "s5_f1": {
   "ar": "ترتيب جامعة مالايا عالميًا في تصنيف QS لعام 2027",
   "en": "Universiti Malaya's world ranking in QS 2027"
  },
  "s5_f2n": {
   "ar": "~$6,000",
   "en": "~$6,000"
  },
  "s5_f2": {
   "ar": "متوسط الرسوم السنوية لمرحلة البكالوريوس",
   "en": "average yearly bachelor tuition"
  },
  "s5_f3n": {
   "ar": "12",
   "en": "12"
  },
  "s5_f3": {
   "ar": "شهرًا من تصريح Graduate Pass للعمل بعد التخرج",
   "en": "months of Graduate Pass after you graduate"
  },
  "s5_examples": {
   "ar": "جامعات نتعامل معها",
   "en": "Universities we work with"
  },
  "s5_cost": {
   "ar": "التكلفة",
   "en": "Cost"
  },
  "s5_fit": {
   "ar": "تناسب",
   "en": "Best for"
  },
  "s6_kicker": {
   "ar": "المحطة 06 · التخرج",
   "en": "Stop 06 · Graduation"
  },
  "s6_title": {
   "ar": "تعود بشهادة… وبشخصية جديدة.",
   "en": "You come back with a degree… and a new you."
  },
  "s6_body": {
   "ar": "شهادة عالمية، ولغة إنجليزية قوية، وتجربة استقلال تظهر في أول مقابلة عمل. ويمكنك البقاء في ماليزيا عامًا بعد التخرج للبحث عن وظيفة من خلال تصريح Graduate Pass.",
   "en": "A global degree, strong English and the independence that shows in your first job interview. You can also stay a year after graduating to look for work on the Graduate Pass."
  },
  "s6_cta": {
   "ar": "دعنا نرسم رحلتك",
   "en": "Let us map your journey"
  },
  "p_kicker": {
   "ar": "لولي الأمر",
   "en": "For parents"
  },
  "p_title": {
   "ar": "أسئلتكم في محلّها، وهذه إجاباتنا.",
   "en": "Your questions are fair. Here are our answers."
  },
  "p_body": {
   "ar": "يمكنكم حضور الاستشارة مع ابنكم أو ابنتكم، في المكتب أو عبر الإنترنت.",
   "en": "You are welcome to join the consultation with your son or daughter, in the office or online."
  },
  "p_q1": {
   "ar": "هل الشهادة معترف بها في بلدي؟",
   "en": "Will the degree be recognised in my country?"
  },
  "p_a1": {
   "ar": "نساعدكم في إجراءات معادلة الشهادة في بلدكم، ونتأكد من أن الجامعة والتخصص معتمدان، وأن جميع الأوراق سليمة ومكتملة قبل التقديم.",
   "en": "We help you with the degree-equivalency process in your country, and make sure the university and major are accredited and that every document is correct and complete before applying."
  },
  "p_q2": {
   "ar": "هل ماليزيا آمنة لابني أو ابنتي؟",
   "en": "Is Malaysia safe for my son or daughter?"
  },
  "p_a2": {
   "ar": "ماليزيا بلد أغلب سكانه مسلمون، والطعام الحلال متوفر في كل مكان، والمساجد موجودة داخل الجامعات. ويستقبل فريق Pioneer الطالب في المطار، ويساعده في إيجاد السكن، ويبقى على تواصل معه.",
   "en": "A Muslim-majority country with halal food everywhere and mosques on campus. The Pioneer team meets students at the airport, helps with housing and stays in touch."
  },
  "p_q3": {
   "ar": "لماذا ماليزيا وليس بريطانيا أو أستراليا؟",
   "en": "Why Malaysia and not the UK or Australia?"
  },
  "p_a3": {
   "ar": "توجد في ماليزيا فروع لجامعات بريطانية وأسترالية تمنح الشهادة نفسها التي تمنحها الجامعة الأم (برامج 3+0)، بتكلفة أقل بكثير، وأقرب إلى الوطن، وفي بيئة مسلمة.",
   "en": "British and Australian universities have branch campuses in Malaysia that award the same degree as home (3+0 programmes), at a far lower cost, closer to home, in a Muslim environment."
  },
  "p_q4": {
   "ar": "ماذا لو كان المعدل أو مستوى اللغة الإنجليزية منخفضًا؟",
   "en": "What if the grades or English level are low?"
  },
  "p_a4": {
   "ar": "تتوفر سنة تأسيسية (Foundation) ودورات مكثفة في اللغة الإنجليزية قبل البكالوريوس، كما أن شروط القبول في الجامعات الخاصة أكثر مرونة. ونحدد المسار المناسب خلال الاستشارة.",
   "en": "There are foundation years and intensive English courses before the bachelor, and private universities have more flexible entry. We pick the right path in the consultation."
  },
  "p_q5": {
   "ar": "كم تكلّف الاستشارة؟",
   "en": "How much does the consultation cost?"
  },
  "p_a5": {
   "ar": "الاستشارة الأولى مجانية بالكامل، ودون أي التزام.",
   "en": "The first consultation is completely free, with no commitment."
  },
  "t_kicker": {
   "ar": "فريقك",
   "en": "Your team"
  },
  "t_title": {
   "ar": "مستشارون تعرفهم بالاسم، لا مجرد رقم في مركز اتصال.",
   "en": "People you know by name, not a call-centre number."
  },
  "t_body": {
   "ar": "مستشارون في مكتب Pioneer بالرياض. اختر المستشار الذي تفضّل أن يتابع معك.",
   "en": "Consultants at the Pioneer office in Riyadh. Choose who you would like to follow up with you."
  },
  "t_whatsapp": {
   "ar": "واتساب",
   "en": "WhatsApp"
  },
  "f_kicker": {
   "ar": "ابدأ رحلتك",
   "en": "Start your journey"
  },
  "f_title": {
   "ar": "دقيقتان… ونرسم لك الطريق.",
   "en": "Two minutes… and we map out your path."
  },
  "f_body": {
   "ar": "أجب عن بضعة أسئلة، وسنتواصل معك لتحديد موعد استشارتك المجانية.",
   "en": "Answer a few questions and we will get in touch to set up your free consultation."
  },
  "f_step": {
   "ar": "خطوة",
   "en": "Step"
  },
  "f_of": {
   "ar": "من",
   "en": "of"
  },
  "f_next": {
   "ar": "التالي",
   "en": "Next"
  },
  "f_back": {
   "ar": "رجوع",
   "en": "Back"
  },
  "f_submit": {
   "ar": "أرسل وابدأ رحلتي",
   "en": "Send and start my journey"
  },
  "f_sending": {
   "ar": "جارٍ الإرسال…",
   "en": "Sending…"
  },
  "f_q_who": {
   "ar": "من يملأ النموذج؟",
   "en": "Who is filling in this form?"
  },
  "f_q_stage": {
   "ar": "ما مرحلتك الدراسية الحالية؟",
   "en": "Where are you in your studies?"
  },
  "f_q_degree": {
   "ar": "ما الدرجة التي تريدها؟",
   "en": "Which degree are you after?"
  },
  "f_q_grades": {
   "ar": "المعدل التقريبي",
   "en": "Approximate grade"
  },
  "f_q_english": {
   "ar": "مستوى اللغة الإنجليزية",
   "en": "English level"
  },
  "f_q_majors": {
   "ar": "ما التخصصات التي تفكر فيها؟",
   "en": "Which fields are you thinking about?"
  },
  "f_h_majors": {
   "ar": "اختر مجالًا واحدًا لتظهر لك التخصصات التابعة له، ويمكنك اختيار أكثر من تخصص داخل المجال.",
   "en": "Pick one field to open its majors. You can choose more than one major within it."
  },
  "f_q_unitarget": {
   "ar": "هل لديك جامعة محددة في ذهنك؟",
   "en": "Do you have a specific university in mind?"
  },
  "f_h_unis": {
   "ar": "اختر جامعة أو أكثر من الجامعات التي نتعامل معها.",
   "en": "Pick one or more of the universities we work with."
  },
  "f_uni_none": {
   "ar": "لا بأس، سنرشّح لك الأنسب خلال الاستشارة.",
   "en": "No problem, we will suggest the best fit in your consultation."
  },
  "f_uni_search": {
   "ar": "ابحث عن جامعة…",
   "en": "Search universities…"
  },
  "f_q_budget": {
   "ar": "الميزانية السنوية التقريبية للرسوم",
   "en": "Approximate yearly tuition budget"
  },
  "f_q_intake": {
   "ar": "متى تريد أن تبدأ؟",
   "en": "When would you like to start?"
  },
  "f_q_recognition": {
   "ar": "هل تحتاج إلى معادلة الشهادة في بلدك؟",
   "en": "Will you need the degree recognised in your country?"
  },
  "f_q_funding": {
   "ar": "طريقة التمويل",
   "en": "Funding"
  },
  "f_q_contact": {
   "ar": "كيف نتواصل معك؟",
   "en": "How do we reach you?"
  },
  "f_name": {
   "ar": "الاسم الكامل",
   "en": "Full name"
  },
  "f_student_name": {
   "ar": "اسم الطالب أو الطالبة",
   "en": "Student's name"
  },
  "f_phone": {
   "ar": "رقم الجوال",
   "en": "Mobile number"
  },
  "f_phone_ph": {
   "ar": "05XXXXXXXX",
   "en": "05XXXXXXXX"
  },
  "f_wa_same": {
   "ar": "هذا الرقم مسجّل في واتساب",
   "en": "This number is on WhatsApp"
  },
  "f_whatsapp": {
   "ar": "رقم الواتساب",
   "en": "WhatsApp number"
  },
  "f_email": {
   "ar": "البريد الإلكتروني",
   "en": "Email"
  },
  "f_email_opt": {
   "ar": "(اختياري)",
   "en": "(optional)"
  },
  "f_q_city": {
   "ar": "المدينة",
   "en": "City"
  },
  "f_q_mode": {
   "ar": "طريقة الاستشارة المفضّلة",
   "en": "Preferred consultation format"
  },
  "f_q_time": {
   "ar": "أفضل وقت للتواصل معك",
   "en": "Best time to call"
  },
  "f_q_consultant": {
   "ar": "من تفضّل أن يتابع معك؟",
   "en": "Who would you like to follow up with you?"
  },
  "f_consent": {
   "ar": "أوافق على استخدام بياناتي للتواصل معي بشأن الدراسة في ماليزيا، وفق",
   "en": "I agree to my data being used to contact me about studying in Malaysia, under the"
  },
  "f_privacy_link": {
   "ar": "سياسة الخصوصية",
   "en": "privacy policy"
  },
  "f_err_pick": {
   "ar": "يُرجى اختيار إجابة للمتابعة.",
   "en": "Pick an answer to continue."
  },
  "f_err_majors": {
   "ar": "يُرجى اختيار تخصص واحد على الأقل، أو «لم أحدد بعد».",
   "en": "Pick at least one major, or \"Not sure yet\"."
  },
  "f_err_unis": {
   "ar": "يُرجى اختيار جامعة واحدة على الأقل.",
   "en": "Pick at least one university."
  },
  "f_err_name": {
   "ar": "يُرجى كتابة اسمك.",
   "en": "Please enter your name."
  },
  "f_err_phone": {
   "ar": "يُرجى كتابة رقم جوال صحيح، مثل 0512345678.",
   "en": "Enter a valid mobile number, e.g. 0512345678."
  },
  "f_err_email": {
   "ar": "البريد الإلكتروني غير صحيح.",
   "en": "That email does not look right."
  },
  "f_err_consent": {
   "ar": "نحتاج إلى موافقتك لنتمكن من التواصل معك.",
   "en": "We need your consent to contact you."
  },
  "f_not_sure": {
   "ar": "لم أحدد بعد",
   "en": "Not sure yet"
  },
  "f_yes": {
   "ar": "نعم، لديّ جامعة",
   "en": "Yes, I do"
  },
  "f_no": {
   "ar": "لا، رشّحوا لي",
   "en": "No, suggest some"
  },
  "f_selected": {
   "ar": "اخترت",
   "en": "Selected"
  },
  "ok_title": {
   "ar": "وصلنا طلبك يا {name}!",
   "en": "We have your request, {name}!"
  },
  "ok_body": {
   "ar": "رقم طلبك {id}. سنتواصل معك خلال {hours} ساعة لتحديد موعد استشارتك المجانية.",
   "en": "Your request number is {id}. We will contact you within {hours} hours to set up your free consultation."
  },
  "ok_book": {
   "ar": "احجز موعدك الآن",
   "en": "Book your slot now"
  },
  "ok_wa": {
   "ar": "تابع معنا عبر واتساب",
   "en": "Continue on WhatsApp"
  },
  "ok_summary": {
   "ar": "ملخص اختياراتك",
   "en": "Your choices"
  },
  "ok_preview": {
   "ar": "وضع المعاينة: النموذج غير مرتبط بقاعدة البيانات بعد، ولم تُحفظ البيانات.",
   "en": "Preview mode: the form is not connected to the database yet, so nothing was saved."
  },
  "err_send": {
   "ar": "تعذّر إرسال طلبك الآن. أرسله إلينا عبر واتساب وسنرد عليك.",
   "en": "We could not send your request right now. Send it on WhatsApp and we will reply."
  },
  "wa_intro": {
   "ar": "السلام عليكم، أرغب في بدء رحلتي للدراسة في ماليزيا.",
   "en": "Hello, I would like to start my study-in-Malaysia journey."
  },
  "footer_office": {
   "ar": "مكتب Pioneer · الرياض",
   "en": "Pioneer office · Riyadh"
  },
  "footer_address": {
   "ar": "طريق الملك فهد، العليا، مقابل مكتبة الملك فهد، مبنى 685، الدور الميزانين، مكتب 1",
   "en": "King Fahd Rd, Al Olaya, opposite King Fahd Library, Building 685, Mezzanine, Office 1"
  },
  "footer_hours": {
   "ar": "الأحد–الخميس 9 ص – 5 م · السبت 10 ص – 3 م",
   "en": "Sun–Thu 9 AM – 5 PM · Sat 10 AM – 3 PM"
  },
  "footer_map": {
   "ar": "افتح الموقع على الخريطة",
   "en": "Open in Maps"
  },
  "footer_note": {
   "ar": "موقع مستشاري Pioneer للخدمات التعليمية في الرياض.",
   "en": "Site of the Pioneer Education Services consultants in Riyadh."
  },
  "footer_privacy": {
   "ar": "سياسة الخصوصية",
   "en": "Privacy policy"
  },
  "privacy_title": {
   "ar": "سياسة الخصوصية",
   "en": "Privacy policy"
  },
  "privacy_body": {
   "ar": "نجمع البيانات التي تكتبها في النموذج (الاسم، والجوال، والبريد الإلكتروني، واختياراتك الدراسية) ومصدر زيارتك، فقط للتواصل معك بشأن الدراسة في ماليزيا وتقديم الاستشارة لك. نحفظ هذه البيانات في قاعدة بيانات خاصة لا يطّلع عليها إلا فريق الاستشارات، ولا نبيعها ولا نشاركها مع أي طرف آخر دون موافقتك، باستثناء الجامعة التي تختار التقديم إليها. يمكنك طلب الاطلاع على بياناتك أو تعديلها أو حذفها في أي وقت عبر واتساب أو البريد الإلكتروني. ونلتزم بنظام حماية البيانات الشخصية في المملكة العربية السعودية.",
   "en": "We collect what you type in the form (name, phone, email and study choices) and where your visit came from, only to contact you about studying in Malaysia and to give you a consultation. It is kept in a private database that only the consulting team can see. We do not sell it or share it with anyone without your consent, except the university you choose to apply to. You can ask to see, correct or delete your data at any time by WhatsApp or email. We follow the Saudi Personal Data Protection Law."
  },
  "privacy_close": {
   "ar": "إغلاق",
   "en": "Close"
  },
  "consent_text": {
   "ar": "نستخدم أدوات قياس بسيطة لمعرفة الإعلانات التي أوصلتك إلينا. هل توافق؟",
   "en": "We use simple measurement tools to know which ads bring you here. Do you agree?"
  },
  "f_q_system": {
   "ar": "ما نظام شهادتك الثانوية؟",
   "en": "Which high-school system are you in?"
  },
  "g_kicker": {
   "ar": "من رحلات طلابنا",
   "en": "From our students’ journeys"
  },
  "g_title": {
   "ar": "صور حقيقية… من طلاب سبقوك إلى ماليزيا.",
   "en": "Real moments… from students who went before you."
  },
  "g_body": {
   "ar": "لحظات من استقبال طلابنا في المطار، وزياراتهم للجامعات، وفعالياتهم، وحفلات التكريم في ماليزيا.",
   "en": "Moments from airport welcomes, campus visits, events and award ceremonies in Malaysia."
  },
  "g_note": {
   "ar": "صور من Pioneer للخدمات التعليمية · اضغط على أي صورة لتكبيرها",
   "en": "Photos from Pioneer Education Services · tap any photo to enlarge it"
  },
  "nav_gallery": {
   "ar": "صور طلابنا",
   "en": "Our students"
  },
  "g_close": {
   "ar": "إغلاق",
   "en": "Close"
  },
  "consent_yes": {
   "ar": "موافق",
   "en": "Agree"
  },
  "consent_no": {
   "ar": "لا شكرًا",
   "en": "No thanks"
  }
 },
 "universityTypes": [
  {
   "id": "public",
   "ar": "حكومية",
   "en": "Public",
   "desc_ar": "جامعات تملكها الدولة، وهي الأعلى تصنيفًا والأقل تكلفة، وشروط القبول فيها أعلى.",
   "desc_en": "State-owned, highest ranked and lowest cost, with higher entry requirements.",
   "cost_ar": "حوالي 3,500–5,500$ سنويًا",
   "cost_en": "about $3,500–5,500 a year",
   "fit_ar": "معدل 80% فأعلى، وميزانية محدودة",
   "fit_en": "80%+ grades and a tighter budget"
  },
  {
   "id": "glc",
   "ar": "شبه حكومية",
   "en": "Government-linked",
   "desc_ar": "تملكها شركات حكومية كبرى مثل بتروناس وشركة الكهرباء الوطنية، وهي قريبة جدًا من سوق العمل.",
   "desc_en": "Owned by major state companies such as Petronas and the national power company, and close to industry.",
   "cost_ar": "متوسطة",
   "cost_en": "mid-range",
   "fit_ar": "الهندسة والتقنية والطاقة",
   "fit_en": "engineering, IT and energy"
  },
  {
   "id": "private",
   "ar": "خاصة",
   "en": "Private",
   "desc_ar": "خيارات واسعة، ومواعيد بدء متعددة خلال العام، وشروط قبول أكثر مرونة.",
   "desc_en": "Wide choice, several intakes a year and more flexible entry.",
   "cost_ar": "متوسطها حوالي 6,000$ سنويًا",
   "cost_en": "around $6,000 a year on average",
   "fit_ar": "معدل 70% فأعلى، والتخصصات التطبيقية",
   "fit_en": "70%+ grades and practical majors"
  },
  {
   "id": "branch",
   "ar": "فروع جامعات أجنبية",
   "en": "Foreign branch campuses",
   "desc_ar": "جامعات بريطانية وأسترالية تمنح الشهادة نفسها التي تمنحها الجامعة الأم، وأنت تدرس في ماليزيا.",
   "desc_en": "British and Australian universities awarding the same degree as their home campus.",
   "cost_ar": "الأعلى، لكنها أقل بكثير من الدراسة في بلد الجامعة الأم",
   "cost_en": "the highest, yet far below studying in the home country",
   "fit_ar": "من يريد شهادة بريطانية أو أسترالية",
   "fit_en": "students who want a UK or Australian degree"
  }
 ],
 "universities": [
  {
   "id": "utm",
   "short": "UTM",
   "name_en": "Universiti Teknologi Malaysia",
   "name_ar": "الجامعة التكنولوجية الماليزية",
   "type": "public",
   "badge_ar": "وكيل ذهبي",
   "badge_en": "Gold Agent"
  },
  {
   "id": "upm",
   "short": "UPM",
   "name_en": "Universiti Putra Malaysia",
   "name_ar": "جامعة بوترا ماليزيا",
   "type": "public"
  },
  {
   "id": "ukm",
   "short": "UKM",
   "name_en": "Universiti Kebangsaan Malaysia",
   "name_ar": "الجامعة الوطنية الماليزية",
   "type": "public"
  },
  {
   "id": "usm",
   "short": "USM",
   "name_en": "Universiti Sains Malaysia",
   "name_ar": "جامعة العلوم الماليزية",
   "type": "public"
  },
  {
   "id": "utp",
   "short": "UTP",
   "name_en": "Universiti Teknologi PETRONAS",
   "name_ar": "جامعة بتروناس التكنولوجية",
   "type": "glc"
  },
  {
   "id": "mmu",
   "short": "MMU",
   "name_en": "Multimedia University",
   "name_ar": "جامعة الوسائط المتعددة",
   "type": "glc"
  },
  {
   "id": "uniten",
   "short": "UNITEN",
   "name_en": "Universiti Tenaga Nasional",
   "name_ar": "جامعة تيناغا الوطنية",
   "type": "glc"
  },
  {
   "id": "unikl",
   "short": "UniKL",
   "name_en": "Universiti Kuala Lumpur",
   "name_ar": "جامعة كوالالمبور",
   "type": "glc"
  },
  {
   "id": "taylors",
   "short": "Taylor's",
   "name_en": "Taylor's University",
   "name_ar": "جامعة تايلورز",
   "type": "private"
  },
  {
   "id": "sunway",
   "short": "Sunway",
   "name_en": "Sunway University",
   "name_ar": "جامعة صنواي",
   "type": "private"
  },
  {
   "id": "ucsi",
   "short": "UCSI",
   "name_en": "UCSI University",
   "name_ar": "جامعة UCSI",
   "type": "private"
  },
  {
   "id": "apu",
   "short": "APU",
   "name_en": "Asia Pacific University",
   "name_ar": "جامعة آسيا والمحيط الهادئ",
   "type": "private"
  },
  {
   "id": "inti",
   "short": "INTI",
   "name_en": "INTI International University",
   "name_ar": "جامعة إنتي الدولية",
   "type": "private"
  },
  {
   "id": "imu",
   "short": "IMU",
   "name_en": "IMU University",
   "name_ar": "الجامعة الطبية الدولية",
   "type": "private"
  },
  {
   "id": "mahsa",
   "short": "MAHSA",
   "name_en": "MAHSA University",
   "name_ar": "جامعة ماهسا",
   "type": "private"
  },
  {
   "id": "msu",
   "short": "MSU",
   "name_en": "Management and Science University",
   "name_ar": "جامعة الإدارة والعلوم",
   "type": "private"
  },
  {
   "id": "lincoln",
   "short": "Lincoln",
   "name_en": "Lincoln University College",
   "name_ar": "كلية لينكولن الجامعية",
   "type": "private"
  },
  {
   "id": "cucms",
   "short": "CUCMS",
   "name_en": "University of Cyberjaya (CUCMS)",
   "name_ar": "جامعة سايبرجايا",
   "type": "private"
  },
  {
   "id": "iukl",
   "short": "IUKL",
   "name_en": "Infrastructure University Kuala Lumpur",
   "name_ar": "جامعة البنية التحتية كوالالمبور",
   "type": "private"
  },
  {
   "id": "cityu",
   "short": "City U",
   "name_en": "City University Malaysia",
   "name_ar": "جامعة سيتي ماليزيا",
   "type": "private"
  },
  {
   "id": "monash",
   "short": "Monash",
   "name_en": "Monash University Malaysia",
   "name_ar": "جامعة موناش ماليزيا",
   "type": "branch"
  },
  {
   "id": "nottingham",
   "short": "Nottingham",
   "name_en": "University of Nottingham Malaysia",
   "name_ar": "جامعة نوتنغهام ماليزيا",
   "type": "branch"
  },
  {
   "id": "southampton",
   "short": "Southampton",
   "name_en": "University of Southampton Malaysia",
   "name_ar": "جامعة ساوثهامبتون ماليزيا",
   "type": "branch"
  },
  {
   "id": "newcastle",
   "short": "Newcastle",
   "name_en": "Newcastle University Medicine Malaysia",
   "name_ar": "جامعة نيوكاسل ماليزيا",
   "type": "branch"
  }
 ],
 "majorGroups": [
  {
   "id": "eng",
   "ar": "الهندسة",
   "en": "Engineering",
   "icon": "gear"
  },
  {
   "id": "health",
   "ar": "الطب والعلوم الصحية",
   "en": "Medicine & health",
   "icon": "pulse"
  },
  {
   "id": "it",
   "ar": "الحاسب وتقنية المعلومات",
   "en": "Computing & IT",
   "icon": "chip"
  },
  {
   "id": "business",
   "ar": "إدارة الأعمال",
   "en": "Business",
   "icon": "chart"
  },
  {
   "id": "design",
   "ar": "العمارة والتصميم والإعلام",
   "en": "Architecture, design & media",
   "icon": "pen"
  },
  {
   "id": "law",
   "ar": "القانون والعلوم الإنسانية",
   "en": "Law & humanities",
   "icon": "scale"
  },
  {
   "id": "science",
   "ar": "العلوم",
   "en": "Sciences",
   "icon": "atom"
  }
 ],
 "majors": [
  {
   "id": "eng_mech",
   "group": "eng",
   "ar": "هندسة ميكانيكية",
   "en": "Mechanical"
  },
  {
   "id": "eng_elec",
   "group": "eng",
   "ar": "هندسة كهربائية وإلكترونية",
   "en": "Electrical & electronic"
  },
  {
   "id": "eng_civil",
   "group": "eng",
   "ar": "هندسة مدنية",
   "en": "Civil"
  },
  {
   "id": "eng_chem",
   "group": "eng",
   "ar": "هندسة كيميائية",
   "en": "Chemical"
  },
  {
   "id": "eng_mecha",
   "group": "eng",
   "ar": "هندسة ميكاترونكس",
   "en": "Mechatronics"
  },
  {
   "id": "eng_pet",
   "group": "eng",
   "ar": "هندسة بترول",
   "en": "Petroleum"
  },
  {
   "id": "eng_aero",
   "group": "eng",
   "ar": "هندسة طيران",
   "en": "Aerospace"
  },
  {
   "id": "eng_comp",
   "group": "eng",
   "ar": "هندسة حاسب",
   "en": "Computer engineering"
  },
  {
   "id": "eng_bio",
   "group": "eng",
   "ar": "هندسة طبية حيوية",
   "en": "Biomedical"
  },
  {
   "id": "eng_ind",
   "group": "eng",
   "ar": "هندسة صناعية",
   "en": "Industrial"
  },
  {
   "id": "eng_renew",
   "group": "eng",
   "ar": "هندسة الطاقة المتجددة",
   "en": "Renewable energy"
  },
  {
   "id": "hl_med",
   "group": "health",
   "ar": "طب بشري",
   "en": "Medicine (MBBS)"
  },
  {
   "id": "hl_dent",
   "group": "health",
   "ar": "طب أسنان",
   "en": "Dentistry"
  },
  {
   "id": "hl_pharm",
   "group": "health",
   "ar": "صيدلة",
   "en": "Pharmacy"
  },
  {
   "id": "hl_nurse",
   "group": "health",
   "ar": "تمريض",
   "en": "Nursing"
  },
  {
   "id": "hl_physio",
   "group": "health",
   "ar": "علاج طبيعي",
   "en": "Physiotherapy"
  },
  {
   "id": "hl_lab",
   "group": "health",
   "ar": "علوم طبية حيوية ومختبرات",
   "en": "Biomedical & lab science"
  },
  {
   "id": "hl_nutri",
   "group": "health",
   "ar": "تغذية",
   "en": "Nutrition & dietetics"
  },
  {
   "id": "hl_ph",
   "group": "health",
   "ar": "صحة عامة",
   "en": "Public health"
  },
  {
   "id": "it_cs",
   "group": "it",
   "ar": "علوم الحاسب",
   "en": "Computer science"
  },
  {
   "id": "it_se",
   "group": "it",
   "ar": "هندسة البرمجيات",
   "en": "Software engineering"
  },
  {
   "id": "it_cyber",
   "group": "it",
   "ar": "الأمن السيبراني",
   "en": "Cybersecurity"
  },
  {
   "id": "it_ai",
   "group": "it",
   "ar": "الذكاء الاصطناعي",
   "en": "Artificial intelligence"
  },
  {
   "id": "it_data",
   "group": "it",
   "ar": "علم البيانات",
   "en": "Data science"
  },
  {
   "id": "it_it",
   "group": "it",
   "ar": "تقنية المعلومات",
   "en": "Information technology"
  },
  {
   "id": "it_is",
   "group": "it",
   "ar": "نظم المعلومات",
   "en": "Information systems"
  },
  {
   "id": "it_games",
   "group": "it",
   "ar": "تطوير الألعاب",
   "en": "Game development"
  },
  {
   "id": "bz_admin",
   "group": "business",
   "ar": "إدارة أعمال",
   "en": "Business administration"
  },
  {
   "id": "bz_acc",
   "group": "business",
   "ar": "محاسبة",
   "en": "Accounting"
  },
  {
   "id": "bz_fin",
   "group": "business",
   "ar": "مالية",
   "en": "Finance"
  },
  {
   "id": "bz_mkt",
   "group": "business",
   "ar": "تسويق",
   "en": "Marketing"
  },
  {
   "id": "bz_hr",
   "group": "business",
   "ar": "موارد بشرية",
   "en": "Human resources"
  },
  {
   "id": "bz_scm",
   "group": "business",
   "ar": "سلاسل الإمداد واللوجستيات",
   "en": "Supply chain & logistics"
  },
  {
   "id": "bz_intl",
   "group": "business",
   "ar": "أعمال دولية",
   "en": "International business"
  },
  {
   "id": "bz_islfin",
   "group": "business",
   "ar": "مالية إسلامية",
   "en": "Islamic finance"
  },
  {
   "id": "bz_hosp",
   "group": "business",
   "ar": "ضيافة وسياحة",
   "en": "Hospitality & tourism"
  },
  {
   "id": "ds_arch",
   "group": "design",
   "ar": "عمارة",
   "en": "Architecture"
  },
  {
   "id": "ds_interior",
   "group": "design",
   "ar": "تصميم داخلي",
   "en": "Interior design"
  },
  {
   "id": "ds_graphic",
   "group": "design",
   "ar": "تصميم جرافيك",
   "en": "Graphic design"
  },
  {
   "id": "ds_media",
   "group": "design",
   "ar": "إعلام واتصال",
   "en": "Mass communication"
  },
  {
   "id": "ds_film",
   "group": "design",
   "ar": "إعلام رقمي وأفلام",
   "en": "Digital media & film"
  },
  {
   "id": "ds_anim",
   "group": "design",
   "ar": "رسوم متحركة",
   "en": "Animation"
  },
  {
   "id": "lw_law",
   "group": "law",
   "ar": "قانون",
   "en": "Law"
  },
  {
   "id": "lw_ir",
   "group": "law",
   "ar": "علاقات دولية",
   "en": "International relations"
  },
  {
   "id": "lw_psy",
   "group": "law",
   "ar": "علم النفس",
   "en": "Psychology"
  },
  {
   "id": "lw_edu",
   "group": "law",
   "ar": "تربية وتعليم",
   "en": "Education"
  },
  {
   "id": "lw_eng",
   "group": "law",
   "ar": "اللغة الإنجليزية",
   "en": "English language"
  },
  {
   "id": "sc_biotech",
   "group": "science",
   "ar": "تقنية حيوية",
   "en": "Biotechnology"
  },
  {
   "id": "sc_food",
   "group": "science",
   "ar": "علوم الأغذية",
   "en": "Food science"
  },
  {
   "id": "sc_actuarial",
   "group": "science",
   "ar": "علوم اكتوارية",
   "en": "Actuarial science"
  },
  {
   "id": "sc_env",
   "group": "science",
   "ar": "علوم البيئة",
   "en": "Environmental science"
  },
  {
   "id": "sc_math",
   "group": "science",
   "ar": "رياضيات وإحصاء",
   "en": "Mathematics & statistics"
  },
  {
   "id": "sc_chem",
   "group": "science",
   "ar": "كيمياء",
   "en": "Chemistry"
  }
 ],
 "options": [
  {
   "list": "who",
   "id": "student",
   "ar": "أنا الطالب",
   "en": "I'm the student"
  },
  {
   "list": "who",
   "id": "parent",
   "ar": "ولي أمر",
   "en": "I'm a parent"
  },
  {
   "list": "who",
   "id": "graduate",
   "ar": "الدراسات العليا",
   "en": "Postgraduate studies"
  },
  {
   "list": "stage",
   "id": "g11",
   "ar": "الصف الثاني الثانوي",
   "en": "Grade 11"
  },
  {
   "list": "stage",
   "id": "g12",
   "ar": "الصف الثالث الثانوي",
   "en": "Grade 12"
  },
  {
   "list": "stage",
   "id": "hs_grad",
   "ar": "خريج الثانوية",
   "en": "High-school graduate"
  },
  {
   "list": "stage",
   "id": "uni_student",
   "ar": "طالب جامعي حاليًا",
   "en": "Currently at university"
  },
  {
   "list": "stage",
   "id": "bachelor",
   "ar": "حاصل على البكالوريوس",
   "en": "I hold a bachelor's"
  },
  {
   "list": "stage",
   "id": "master",
   "ar": "حاصل على الماجستير",
   "en": "I hold a master's"
  },
  {
   "list": "system",
   "id": "arabic",
   "ar": "شهادة ثانوية عربية",
   "en": "Arabic secondary certificate"
  },
  {
   "list": "system",
   "id": "american",
   "ar": "الدبلوما الأمريكية (American Diploma)",
   "en": "American Diploma"
  },
  {
   "list": "system",
   "id": "ig",
   "ar": "البريطانية (IGCSE / A-Level)",
   "en": "British (IGCSE / A-Level)"
  },
  {
   "list": "system",
   "id": "ib",
   "ar": "البكالوريا الدولية (IB)",
   "en": "International Baccalaureate (IB)"
  },
  {
   "list": "system",
   "id": "other",
   "ar": "نظام آخر",
   "en": "Other"
  },
  {
   "list": "degree",
   "id": "foundation",
   "ar": "سنة تأسيسية",
   "en": "Foundation"
  },
  {
   "list": "degree",
   "id": "diploma",
   "ar": "دبلوم",
   "en": "Diploma"
  },
  {
   "list": "degree",
   "id": "bachelor",
   "ar": "بكالوريوس",
   "en": "Bachelor's"
  },
  {
   "list": "degree",
   "id": "master",
   "ar": "ماجستير",
   "en": "Master's"
  },
  {
   "list": "degree",
   "id": "phd",
   "ar": "دكتوراه",
   "en": "PhD"
  },
  {
   "list": "degree",
   "id": "english",
   "ar": "دورة لغة إنجليزية",
   "en": "English course"
  },
  {
   "list": "grades",
   "id": "lt70",
   "ar": "أقل من 70%",
   "en": "Below 70%"
  },
  {
   "list": "grades",
   "id": "70_79",
   "ar": "70–79%",
   "en": "70–79%"
  },
  {
   "list": "grades",
   "id": "80_89",
   "ar": "80–89%",
   "en": "80–89%"
  },
  {
   "list": "grades",
   "id": "90p",
   "ar": "90% فأعلى",
   "en": "90%+"
  },
  {
   "list": "grades",
   "id": "na",
   "ar": "لم تصدر بعد",
   "en": "Not out yet"
  },
  {
   "list": "english",
   "id": "ielts6",
   "ar": "IELTS 6 أو أعلى",
   "en": "IELTS 6 or higher"
  },
  {
   "list": "english",
   "id": "ielts55",
   "ar": "IELTS 5.5",
   "en": "IELTS 5.5"
  },
  {
   "list": "english",
   "id": "good",
   "ar": "جيد دون شهادة",
   "en": "Good, no certificate"
  },
  {
   "list": "english",
   "id": "weak",
   "ar": "أحتاج إلى دورة",
   "en": "I need a course"
  },
  {
   "list": "budget",
   "id": "lt20",
   "ar": "أقل من 20 ألف ريال",
   "en": "Under SAR 20k"
  },
  {
   "list": "budget",
   "id": "20_35",
   "ar": "20–35 ألف ريال",
   "en": "SAR 20–35k"
  },
  {
   "list": "budget",
   "id": "35_60",
   "ar": "35–60 ألف ريال",
   "en": "SAR 35–60k"
  },
  {
   "list": "budget",
   "id": "60p",
   "ar": "أكثر من 60 ألف ريال",
   "en": "Over SAR 60k"
  },
  {
   "list": "budget",
   "id": "unknown",
   "ar": "لم نحدد بعد",
   "en": "Not decided yet"
  },
  {
   "list": "intake",
   "id": "2027_02",
   "ar": "يناير–مارس 2027",
   "en": "Jan–Mar 2027"
  },
  {
   "list": "intake",
   "id": "2027_09",
   "ar": "سبتمبر–أكتوبر 2027",
   "en": "Sep–Oct 2027"
  },
  {
   "list": "intake",
   "id": "2028",
   "ar": "2028 أو بعدها",
   "en": "2028 or later"
  },
  {
   "list": "intake",
   "id": "unsure",
   "ar": "غير متأكد",
   "en": "Not sure"
  },
  {
   "list": "recognition",
   "id": "yes",
   "ar": "نعم، مهم جدًا",
   "en": "Yes, very"
  },
  {
   "list": "recognition",
   "id": "no",
   "ar": "ليس ضروريًا",
   "en": "Not essential"
  },
  {
   "list": "recognition",
   "id": "unsure",
   "ar": "لا أعرف",
   "en": "I don't know"
  },
  {
   "list": "funding",
   "id": "self",
   "ar": "على نفقتي أو نفقة الأسرة",
   "en": "Self or family funded"
  },
  {
   "list": "funding",
   "id": "scholarship",
   "ar": "ابتعاث أو منحة",
   "en": "Scholarship"
  },
  {
   "list": "funding",
   "id": "employer",
   "ar": "جهة العمل",
   "en": "Employer"
  },
  {
   "list": "funding",
   "id": "unsure",
   "ar": "غير متأكد",
   "en": "Not sure"
  },
  {
   "list": "city",
   "id": "riyadh",
   "ar": "الرياض",
   "en": "Riyadh"
  },
  {
   "list": "city",
   "id": "jeddah",
   "ar": "جدة",
   "en": "Jeddah"
  },
  {
   "list": "city",
   "id": "makkah",
   "ar": "مكة",
   "en": "Makkah"
  },
  {
   "list": "city",
   "id": "madinah",
   "ar": "المدينة",
   "en": "Madinah"
  },
  {
   "list": "city",
   "id": "eastern",
   "ar": "الدمام والخبر",
   "en": "Dammam & Khobar"
  },
  {
   "list": "city",
   "id": "qassim",
   "ar": "القصيم",
   "en": "Qassim"
  },
  {
   "list": "city",
   "id": "south",
   "ar": "أبها وخميس مشيط",
   "en": "Abha & Khamis"
  },
  {
   "list": "city",
   "id": "other",
   "ar": "مدينة أخرى أو خارج السعودية",
   "en": "Another city or outside Saudi Arabia"
  },
  {
   "list": "mode",
   "id": "office",
   "ar": "زيارة المكتب",
   "en": "Office visit"
  },
  {
   "list": "mode",
   "id": "online",
   "ar": "اجتماع عبر الإنترنت",
   "en": "Online meeting"
  },
  {
   "list": "mode",
   "id": "call",
   "ar": "مكالمة",
   "en": "Phone call"
  },
  {
   "list": "mode",
   "id": "whatsapp",
   "ar": "واتساب",
   "en": "WhatsApp"
  },
  {
   "list": "time",
   "id": "morning",
   "ar": "الصباح",
   "en": "Morning"
  },
  {
   "list": "time",
   "id": "afternoon",
   "ar": "العصر",
   "en": "Afternoon"
  },
  {
   "list": "time",
   "id": "evening",
   "ar": "المساء",
   "en": "Evening"
  }
 ],
 "team": [
  {
   "id": "ahmad",
   "name_ar": "أحمد أحمد",
   "name_en": "Ahmad Ahmad",
   "role_ar": "مستشار تعليمي",
   "role_en": "Education consultant",
   "whatsapp": "966590873178",
   "email": "ahmad.a.asalia@gmail.com",
   "receives_leads": true
  },
  {
   "id": "asmaa",
   "name_ar": "أسماء علي",
   "name_en": "Asmaa Ali",
   "role_ar": "مستشارة تعليمية",
   "role_en": "Education consultant",
   "whatsapp": "",
   "email": "",
   "receives_leads": true
  }
 ],
 "gallery": [
  {
   "id": "airport",
   "src": "https://pioneer4ss.com/wp-content/uploads/2025/04/Untitled-design-8.jpg",
   "caption_ar": "استقبال الطلاب في مطار كوالالمبور",
   "caption_en": "Welcoming students at Kuala Lumpur airport"
  },
  {
   "id": "ceremony",
   "src": "https://pioneer4ss.com/wp-content/uploads/2025/04/4.jpg",
   "caption_ar": "حفل Pioneer لطلابنا في ماليزيا",
   "caption_en": "Pioneer ceremony for our students in Malaysia"
  },
  {
   "id": "newcastle",
   "src": "https://pioneer4ss.com/wp-content/uploads/2025/04/1-1.jpg",
   "caption_ar": "زيارة جامعة نيوكاسل ماليزيا",
   "caption_en": "Visiting Newcastle University Malaysia"
  },
  {
   "id": "fair",
   "src": "https://pioneer4ss.com/wp-content/uploads/2025/04/6.jpg",
   "caption_ar": "طلاب Pioneer في معرض تعليمي",
   "caption_en": "Pioneer students at an education fair"
  },
  {
   "id": "tournament",
   "src": "https://pioneer4ss.com/wp-content/uploads/2025/04/3-1.jpg",
   "caption_ar": "تكريم الفائزين في بطولة الطلاب",
   "caption_en": "Honouring the winners of a student tournament"
  },
  {
   "id": "award",
   "src": "https://pioneer4ss.com/wp-content/uploads/2025/04/2-1.jpg",
   "caption_ar": "فريق Pioneer في حفل تكريم",
   "caption_en": "The Pioneer team at an awards event"
  },
  {
   "id": "note",
   "src": "https://pioneer4ss.com/wp-content/uploads/2025/04/5.jpg",
   "caption_ar": "رسالة شكر من أحد طلابنا",
   "caption_en": "A thank-you note from one of our students"
  }
 ]
};

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
      stage: lb.stage || data.stage, curriculum: lb.curriculum || data.curriculum || '', degree: lb.degree || data.degree, grades: lb.grades || data.grades, english: lb.english || data.english,
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
    ['المرحلة', row.stage], ['نظام الشهادة', row.curriculum], ['الدرجة', row.degree], ['النسبة', row.grades], ['الإنجليزي', row.english], ['التخصصات', row.majors],
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
  MailApp.sendEmail({ to: uniq.join(','), subject: flame + 'عميل جديد (' + row.score + '): ' + row.full_name + ' · ' + (row.majors || ''), htmlBody: html, name: 'الدراسة في ماليزيا' });
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
    gallery: strip(visible(readRows_(ss, 'Gallery')).filter((g) => /^https:\/\//.test(String(g.src || ''))), ['id', 'src', 'caption_ar', 'caption_en']),
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
  else if (name === 'Gallery') list = order(SEED.gallery || []);
  else if (name === 'Team') list = order(SEED.team).map((m) => Object.assign({}, m, { receives_leads: m.receives_leads ? YES : NO }));
  return list.map((o) => cols.map((c) => (o[c] === undefined || o[c] === null ? '' : o[c])));
}

function setupReadme_(ss) {
  let sh = ss.getSheetByName('اقرأني');
  if (!sh) sh = ss.insertSheet('اقرأني', 0);
  sh.clear();
  sh.setRightToLeft(true);
  const lines = [
    ['الدراسة في ماليزيا: قاعدة بيانات العملاء ولوحة تحكم الموقع'],
    [''],
    ['Leads: كل عميل يعبّي النموذج ينزل هنا صف جديد. غيّر الحالة والمستشار وموعد المتابعة من القوائم المنسدلة.'],
    ['ما تغيّر أسماء الأعمدة في الصف الأول ولا أسماء التبويبات: الموقع والـ CRM يعتمدون عليها.'],
    [''],
    ['Universities / Majors / MajorGroups / Options / Team / UniversityTypes / Gallery: كل صف فيه عمود visible.'],
    ['Gallery: صور معرض «من رحلات طلابنا». ضع رابط الصورة المباشر في عمود src.'],
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
