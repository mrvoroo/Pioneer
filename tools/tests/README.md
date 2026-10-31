# Tests

Run a local server from the repo root (`python -m http.server 8080`), then:

```
node tools/tests/scenes.js     # every section shows the right 3D shape, AR/EN, desktop/phone, plane direction
node tools/tests/edge.js       # language switch mid-scene, reload, hash links, resize, reduced motion, no WebGL, frantic scrolling
node tools/tests/formtest.js   # form validation, phone formats, drafts, double submit, API failure, consent, tabs, privacy, mobile CTA
```

Needs Playwright with Chromium. `SITE_URL=https://mrvoroo.github.io/Pioneer/` runs them against the live site.
