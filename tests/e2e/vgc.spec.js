// The replay-analyzer pages: the hand-written landing pages (/vgc/, /pt/vgc/) and the generated sample reports.
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const LANDING = ['/vgc/', '/pt/vgc/'];
const REPORTS = ['real_bo3_set', 'selfplay_proven_win', 'selfplay_with_paste'].map(n => `/vgc/reports/${n}.html`);

test.beforeEach(async ({ page }, testInfo) => {
  const problems = [];
  page.on('console', msg => { if (msg.type() === 'error') problems.push(`console: ${msg.text()}`); });
  page.on('pageerror', err => problems.push(`pageerror: ${err.message}`));
  page.on('response', res => {
    if (res.url().startsWith('http://127.0.0.1') && res.status() >= 400) problems.push(`HTTP ${res.status()} ${res.url()}`);
  });
  testInfo.problems = problems;
});

test.afterEach(async ({}, testInfo) => {
  expect(testInfo.problems, 'console errors / failed requests').toEqual([]);
});

async function noHorizontalScroll(page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
}

async function noSeriousAxe(page) {
  const results = await new AxeBuilder({ page }).analyze();
  const serious = results.violations.filter(v => ['serious', 'critical'].includes(v.impact));
  expect(serious.map(v => `${v.id}: ${v.nodes.length} node(s) — ${v.help}`)).toEqual([]);
}

test('home cards link to the analyzer in each language', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.project[data-project="vgc-selfplay"] a[href="/vgc/"]')).toHaveCount(1);
  await page.goto('/pt/');
  await expect(page.locator('.project[data-project="vgc-selfplay"] a[href="/pt/vgc/"]')).toHaveCount(1);
});

test('the project dialog shows the analyzer link', async ({ page }) => {
  await page.goto('/');
  await page.locator('.project[data-project="vgc-selfplay"] .project-open').click();
  await expect(page.locator('#project-modal a[href="/vgc/"]')).toBeVisible();
});

for (const url of LANDING) {
  test(`landing ${url} renders, links resolve, carries the notice`, async ({ page, request }) => {
    await page.goto(url);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(page.locator('.vgc-card')).toHaveCount(REPORTS.length);
    await expect(page.locator('footer')).toContainText('Nintendo');
    // No placeholder left over from the calibration numbers.
    expect(await page.content()).not.toMatch(/CALIB_/);
    await noHorizontalScroll(page);
    const hrefs = await page.$$eval('a[href^="/"]', as => [...new Set(as.map(a => a.getAttribute('href').split('#')[0]))]);
    for (const href of hrefs) expect((await request.get(href)).status(), href).toBe(200);
  });

  for (const scheme of ['light', 'dark']) {
    test(`landing ${url}: no serious accessibility violations (${scheme})`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme });
      await page.goto(url);
      await noSeriousAxe(page);
    });
  }
}

for (const url of REPORTS) {
  test(`report ${url} renders the bot's choices and the notice`, async ({ page }) => {
    await page.goto(url);
    await expect(page.locator('.xp-opts').first()).toBeAttached();
    await expect(page.locator('body')).toContainText('Nintendo');
    await noHorizontalScroll(page);
  });

  for (const scheme of ['light', 'dark']) {
    test(`report ${url}: no serious accessibility violations (${scheme})`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme });
      await page.goto(url);
      await noSeriousAxe(page);
    });
  }

  test(`report ${url} is anonymized and self-contained`, async ({ page }) => {
    const external = [];
    page.on('request', req => { if (!req.url().startsWith('http://127.0.0.1') && !req.url().startsWith('data:')) external.push(req.url()); });
    await page.goto(url);
    const html = await page.content();
    expect(html).not.toMatch(/replay\.pokemonshowdown\.com|\/mnt\/|\/home\/|palmeida/);
    expect(external).toEqual([]);
  });
}
