# Pedro Ivo Almeida — Portfolio

Personal portfolio site, hosted on GitHub Pages. Plain HTML/CSS/JS, no build step.

The hero background is a live **lattice-Boltzmann** simulation (`js/fluid.js`): flow past a
cylinder at Re = 120 (D2Q9 BGK) whose vortex street cools a heated plate, with temperature
carried as a passive scalar on a second D2Q5 lattice (Pr = 0.7). Vorticity is drawn in cool
tones, temperature in warm tones, and the HUD shows the plate-averaged Nusselt number.
Move the cursor over it to stir the flow.

## Structure

```
index.html        single-page site (all content lives here)
404.html          not-found page
css/style.css     styles, light/dark tokens, print styles
js/fluid.js       LBM solver + renderer for the hero
js/main.js        theme toggle, mobile nav, pixel-art icons
assets/           favicon, Pip the mail bird, resume PDF, self-hosted fonts (SIL OFL)
tests/unit/       solver checks: stability, vortex shedding, Nusselt number, cylinder placement
tests/e2e/        Playwright rendering checks at desktop / laptop / phone sizes
tests/serve.js    tiny static server used by the tests
```

## Run locally

```bash
npm run serve                 # http://127.0.0.1:4173
```

## Tests

```bash
npm ci && npx playwright install chromium   # once
npm test                                    # lint + solver tests + browser rendering tests
```

The browser tests fail on console errors, broken links or assets, horizontal scrolling, fonts
that don't load, text under 12px, captions overlapping the hero text, a frozen or blank
simulation, and serious accessibility (axe) violations in light and dark themes. Full-page
screenshots land in `test-results/screenshots/`.

A pre-push hook runs `npm test` before any push to `main` (enable with
`git config core.hooksPath .githooks`).

## Deploy (GitHub Pages)

`.github/workflows/ci.yml` runs every check on pull requests and on pushes to `main`.
It deploys to https://pialmeida.github.io/ **only after the tests pass**, so a broken
change never goes live. Pages source must be set to **GitHub Actions**
(Settings → Pages → Source). Each run uploads screenshots as an artifact.

## Editing content

- Text, jobs, projects: edit the matching `<section>` in `index.html`.
- Pixel icons: ASCII maps in `ICONS` inside `js/main.js` (`#` ink, `a` teal, `b` amber).
- Resume: replace `assets/Pedro_Ivo_Almeida_Resume.pdf` (keep the phone number off the public copy).
