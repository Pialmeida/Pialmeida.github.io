// Rendering checks in a real browser (Chromium) at desktop, laptop, and phone sizes.
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const SECTIONS = ['about', 'experience', 'projects', 'research', 'beyond', 'contact'];

// Collect console errors, uncaught exceptions and failed same-origin requests for every test.
test.beforeEach(async ({ page }, testInfo) => {
  const problems = [];
  page.on('console', msg => { if (msg.type() === 'error') problems.push(`console: ${msg.text()}`); });
  page.on('pageerror', err => problems.push(`pageerror: ${err.message}`));
  page.on('response', res => {
    if (res.url().startsWith('http://127.0.0.1') && res.status() >= 400 && !res.url().includes('/does-not-exist'))
      problems.push(`HTTP ${res.status()} ${res.url()}`);
  });
  testInfo.problems = problems;
});

test.afterEach(async ({}, testInfo) => {
  expect(testInfo.problems, 'console errors / failed requests').toEqual([]);
});

test('home page renders all sections', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle(/Pedro Ivo Almeida/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Pedro Ivo Almeida');
  for (const id of SECTIONS) await expect(page.locator(`#${id}`)).toBeAttached();
  // Every in-page link points at something that exists.
  const hrefs = await page.$$eval('a[href^="#"]', as => as.map(a => a.getAttribute('href')));
  for (const href of hrefs) await expect(page.locator(href === '#top' ? '#top' : href)).toBeAttached();
});

test('no horizontal scrolling', async ({ page }) => {
  await page.goto('/');
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});

test('fluid simulation draws and updates', async ({ page }) => {
  await page.addInitScript(() => { window.__FLUID_DEBUG__ = {}; });
  await page.goto('/');
  await page.waitForFunction(() => window.__FLUID_DEBUG__.sim?.warmup === 0, null, { timeout: 20_000 });
  const canvas = page.locator('#flow');
  await expect(canvas).toBeVisible();
  await expect(page.locator('#flow-hud')).toHaveText(/Nu_D \d+\.\d/, { timeout: 15_000 });

  const sample = () => canvas.evaluate(c => {
    const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
    const colours = new Set();
    let sum = 0;
    for (let i = 0; i < d.length; i += 4) { colours.add((d[i] << 16) | (d[i + 1] << 8) | d[i + 2]); sum += d[i] * 3 + d[i + 1] * 5 + d[i + 2] * 7; }
    return { colours: colours.size, sum };
  });
  const a = await sample();
  await page.waitForTimeout(1500);
  const b = await sample();
  expect(a.colours, 'canvas should show more than a flat background').toBeGreaterThan(5);
  expect(b.sum, 'frames should change over time').not.toBe(a.sum);

  // Pause button stops the animation.
  await page.getByRole('button', { name: 'Pause' }).click();
  const c1 = await sample();
  await page.waitForTimeout(500);
  expect((await sample()).sum).toBe(c1.sum);
});

test('cylinder does not sit behind the hero text', async ({ page, isMobile }) => {
  test.skip(isMobile, 'on phones the text spans the full width by design');
  await page.addInitScript(() => { window.__FLUID_DEBUG__ = {}; });
  await page.goto('/');
  const { cylLeft, textRight } = await page.evaluate(() => {
    const sim = window.__FLUID_DEBUG__.sim;
    const rect = document.getElementById('flow').getBoundingClientRect();
    const { cx, r } = sim.geom;
    return {
      cylLeft: rect.left + ((cx - r) / sim.W) * rect.width,
      textRight: document.querySelector('.hero-lede').getBoundingClientRect().right,
    };
  });
  expect(cylLeft).toBeGreaterThan(textRight);
});

test('theme toggle switches light/dark', async ({ page, isMobile }) => {
  await page.goto('/');
  if (isMobile) await page.getByRole('button', { name: 'Menu' }).click();
  const before = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  await page.getByRole('button', { name: 'Toggle dark mode' }).click();
  const after = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  expect(after).not.toBe(before);
});

test('mobile menu opens and navigates', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'phone-only menu');
  await page.goto('/');
  const menu = page.getByRole('button', { name: 'Menu' });
  await menu.click();
  await expect(menu).toHaveAttribute('aria-expanded', 'true');
  await page.locator('#nav-links').getByRole('link', { name: 'Projects' }).click();
  await expect(menu).toHaveAttribute('aria-expanded', 'false');
  await expect(page.locator('#projects')).toBeInViewport();
});

test('pixel icons are generated', async ({ page }) => {
  await page.goto('/');
  const missing = await page.$$eval('[data-pixel]', els => els.filter(e => !e.querySelector('svg rect')).length);
  expect(missing).toBe(0);
});

test('resume and contact links are valid', async ({ page, request }) => {
  await page.goto('/');
  const resume = await request.get('/assets/Pedro_Ivo_Almeida_Resume.pdf');
  expect(resume.status()).toBe(200);
  expect(resume.headers()['content-type']).toContain('pdf');
  await expect(page.locator('a[href^="mailto:"]')).toHaveAttribute('href', 'mailto:almeida.pedro.ivo@gmail.com');
  await expect(page.locator('a[href="https://github.com/Pialmeida"]')).toHaveCount(1);
});

for (const scheme of ['light', 'dark']) {
  test(`no serious accessibility violations (${scheme} theme)`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme });
    await page.goto('/');
    const results = await new AxeBuilder({ page }).analyze();
    const serious = results.violations.filter(v => ['serious', 'critical'].includes(v.impact));
    expect(serious.map(v => `${v.id}: ${v.nodes.length} node(s) — ${v.help}`)).toEqual([]);
  });
}

test('all fonts load (no invisible text)', async ({ page }) => {
  await page.goto('/');
  const fonts = await page.evaluate(async () => {
    await document.fonts.ready;
    // Force-load every face the page uses, then report status per face.
    await Promise.all([...document.fonts].map(f => f.load().catch(() => {})));
    return [...document.fonts].map(f => `${f.family} ${f.weight} ${f.status}`);
  });
  expect(fonts.filter(f => !f.endsWith('loaded'))).toEqual([]);
  expect(await page.evaluate(() => document.fonts.check('16px Silkscreen') && document.fonts.check('16px Inter'))).toBe(true);
});

test('all visible text is at least 12px and actually rendered', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => document.fonts.ready);
  const bad = await page.evaluate(() => {
    const out = [];
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const text = n.textContent.trim();
      const el = n.parentElement;
      if (!text || !el || el.closest('script, style, [aria-hidden="true"], .skip-link')) continue;
      const cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden' || !el.getClientRects().length) continue;
      if (el.closest('.nav-links') && !el.closest('.nav-links').getClientRects().length) continue;
      const size = parseFloat(cs.fontSize);
      const range = document.createRange(); range.selectNodeContents(n);
      const w = range.getBoundingClientRect().width;
      if (size < 12) out.push(`${size}px: "${text.slice(0, 40)}"`);
      if (w === 0 && cs.opacity !== '0') out.push(`zero-width text: "${text.slice(0, 40)}"`);
    }
    return out;
  });
  expect(bad).toEqual([]);
});

test('404 page renders', async ({ page }) => {
  await page.goto('/404.html');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('perception check');
  await expect(page.locator('.d20 svg rect').first()).toBeAttached();
});

test('full-page screenshot', async ({ page }, testInfo) => {
  await page.goto('/');
  await expect(page.locator('#flow-hud')).toHaveText(/Nu_D/, { timeout: 15_000 });
  await page.waitForTimeout(2000);
  await testInfo.attach('home', { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' });
  await page.screenshot({ path: `test-results/screenshots/home-${testInfo.project.name}.png`, fullPage: true });
});

test('simulation caption never overlaps hero text', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => document.fonts.ready);
  const overlaps = await page.evaluate(() => {
    const boxes = sel => [...document.querySelectorAll(sel)].map(e => [e, e.getBoundingClientRect()]);
    const hit = (a, b) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
    const out = [];
    for (const [ce, c] of boxes('.flow-caption > *')) {
      if (!c.width) continue;
      for (const [te, t] of boxes('.hero-inner h1, .hero-inner p, .hero-actions .btn, .hero-stats > div'))
        if (hit(c, t)) out.push(`${ce.className || ce.id} overlaps "${te.textContent.trim().slice(0, 30)}"`);
    }
    return out;
  });
  expect(overlaps).toEqual([]);
});
