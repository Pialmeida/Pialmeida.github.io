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
assets/           favicon, Pip the mail bird, (optional) resume PDF
```

## Run locally

```bash
python3 -m http.server 8000   # then open http://localhost:8000
```

## Deploy (GitHub Pages)

1. Create a repo named `Pialmeida.github.io` (serves at `https://pialmeida.github.io/`).
2. `git remote add origin git@github.com:Pialmeida/Pialmeida.github.io.git && git push -u origin main`
3. Repo **Settings → Pages → Source: Deploy from a branch → `main` / root**.

## Editing content

- Text, jobs, projects: edit the matching `<section>` in `index.html`.
- Pixel icons: ASCII maps in `ICONS` inside `js/main.js` (`#` ink, `a` teal, `b` amber).
- Resume button: drop a PDF in `assets/` and uncomment the button in the hero.
