# الدراسة في ماليزيا · Study in Malaysia

موقع قصة بالـ 3D لمستشاري Pioneer في الرياض. بياخد الطالب أو ولي الأمر من المدرسة لحد التخرج في ماليزيا، وفي الآخر بيسجله في نموذج استشارة مجانية. البيانات بتنزل في Google Sheet، والشيت ده هو قاعدة البيانات ولوحة التحكم في نفس الوقت.

A 3D scroll-story lead funnel for Pioneer's Riyadh study-in-Malaysia consultants. Arabic by default, English one click away. Leads land in a Google Sheet that doubles as the site's control panel.

## الملفات / Files

| Path | What it is |
|---|---|
| `index.html` | Page shell |
| `assets/js/world.js` | Three.js particle field that morphs through the story (Petronas Towers → school → car → Kingdom Centre → globe + flight → campus → graduation cap → shield) |
| `assets/js/app.js` | Rendering, AR/EN, scroll story (GSAP ScrollTrigger), multi-step lead form, tracking |
| `assets/js/content.js` | Default texts and data (used until the sheet is connected, and to seed the sheet) |
| `assets/js/config.js` | The Apps Script web-app URL |
| `apps-script/Code.gs` | Google Apps Script: leads API, config API, scoring, routing, email alerts, sheet setup |
| `SETUP.md` | دليل التشغيل خطوة بخطوة |

## Stack

Plain HTML/CSS/JS, no build step. Three.js r169, GSAP 3.13 + ScrollTrigger, fonts bundled locally (El Messiri, Tajawal, Space Grotesk, Inter). Hosted on GitHub Pages; Google Sheets + Apps Script as the backend.

## Run locally

```
python -m http.server 8080
```

Then open http://localhost:8080.

## Updating the live site

GitHub Pages lets browsers cache files for up to 10 minutes. After changing CSS or JS, bump the `?v=` value on the `<link>`/`<script>` tags in `index.html` and on the `world.js` import at the top of `assets/js/app.js`, so visitors get the new files right away.
