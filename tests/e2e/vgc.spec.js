// The replay-analyzer pages: the hand-written landing pages (/vgc/, /pt/vgc/) and the generated sample reports.
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const LANDING = ['/vgc/', '/pt/vgc/'];
const REPORTS = ['real_bo3_set', 'ladder_proven_win', 'ladder_close_set', 'selfplay_proven_win', 'selfplay_with_paste'].map(n => `/vgc/reports/${n}.html`);

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
  // Against the device's width, not window.innerWidth: a mobile browser widens its layout viewport to fit content
  // that overflows, so innerWidth grows with the page and the overflow reads 0 (a 448 px page on a 412 px phone).
  const device = page.viewportSize().width;
  const width = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(width - device).toBeLessThanOrEqual(0);
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

  for (const scheme of ['light', 'dark']) {
    test(`report ${url}: full report view, no serious accessibility violations (${scheme})`, async ({ page }) => {
      // Every turn is in the DOM here (~13k elements on a Bo3 set): one axe pass alone takes 31-36 s on athene's
      // EPYC nodes (color-contrast ~22 s, region ~11 s), past the 45 s default once 4 workers share the CPU.
      test.slow();
      await page.emulateMedia({ colorScheme: scheme });
      await page.goto(url);
      await page.locator('#modes [data-mode="full"]').click();
      await expect(page.locator('#teams')).toBeVisible();
      await noSeriousAxe(page);
      await noHorizontalScroll(page);
    });
  }

  test(`report ${url}: the turn viewer is the default view, Next / Prev and the arrow keys change the turn`, async ({ page }) => {
    await page.goto(url);
    await expect(page.locator('#viewer')).toBeVisible();
    await expect(page.locator('#teams')).toBeHidden();
    await expect(page.locator('article.turn:visible')).toHaveCount(1);
    const title = page.locator('#v-title');
    await expect(title).toHaveText(/^Game 1 · (Leads|Turn \d+ of \d+)$/);
    const start = new URL(page.url()).hash;
    expect(start).toMatch(/^#g1t\d+$/);
    await page.locator('#v-next').click();
    await expect(page).not.toHaveURL(new RegExp(start + '$'));
    const next = new URL(page.url()).hash;
    await expect(page.locator(`article${next}`)).toBeVisible();
    await expect(page.locator('article.turn:visible')).toHaveCount(1);
    await expect(page.locator('#v-live')).toContainText('Game 1');
    await page.locator('#v-prev').click();
    await expect(page).toHaveURL(new RegExp(start + '$'));
    await page.keyboard.press('ArrowRight');
    await expect(page).toHaveURL(new RegExp(next + '$'));
    await page.keyboard.press('ArrowLeft');
    await expect(page).toHaveURL(new RegExp(start + '$'));
    await page.keyboard.press('Home');
    await expect(page).toHaveURL(/#g1t0$/);
    await expect(title).toHaveText('Game 1 · Leads');
    await expect(page.locator('#v-prev')).toHaveAttribute('aria-disabled', 'true');
    await page.keyboard.press('End');
    const last = await page.locator('.v-strip[data-game="1"] .tick').last().getAttribute('data-target');
    await expect(page).toHaveURL(new RegExp('#' + last + '$'));
    // the strip: one tick per turn of the game, the current one marked
    await page.locator('.v-strip[data-game="1"] .tick[data-target="g1t1"]').click();
    await expect(page).toHaveURL(/#g1t1$/);
    await expect(page.locator('.tick[data-target="g1t1"]')).toHaveAttribute('aria-current', 'true');
    await noHorizontalScroll(page);
  });

  test(`report ${url}: a #gNtM deep link opens that turn; key moments open the viewer`, async ({ page }) => {
    const many = !url.includes('selfplay_with_paste');
    const target = many ? 'g2t3' : 'g1t3';
    await page.goto(`${url}#${target}`);
    await expect(page.locator(`article#${target}`)).toBeVisible();
    await expect(page.locator('article.turn:visible')).toHaveCount(1);
    await expect(page.locator('#v-title')).toHaveText(new RegExp(`^Game ${many ? 2 : 1} · Turn 3 of \\d+$`));
    await expect(page.locator(`.tick[data-target="${target}"]`)).toHaveAttribute('aria-current', 'true');
    // the full report, then a key moment's link back into the viewer
    await page.locator('#modes [data-mode="full"]').click();
    await expect(page.locator('#teams')).toBeVisible();
    expect(await page.locator('article.turn:visible').count()).toBeGreaterThan(1);
    const moment = page.locator('#moments a.when').first();
    if (await moment.count()) {
      const href = await moment.getAttribute('href');
      await moment.click();
      await expect(page.locator(`article${href}`)).toBeVisible();
      await expect(page.locator('article.turn:visible')).toHaveCount(1);
      await expect(page.locator('#teams')).toBeHidden();
    }
    await noHorizontalScroll(page);
  });

  test(`report ${url}: the chips show embedded sprites and the notice credits them`, async ({ page }) => {
    await page.goto(url);
    const spr = page.locator('article.turn.cur .spr').first();
    await expect(spr).toBeVisible();
    const bg = await spr.evaluate(e => getComputedStyle(e).backgroundImage);
    expect(bg).toMatch(/^url\("data:image\/png;base64,/);
    await expect(page.locator('footer.notice')).toContainText('Smogon Sprite Project');
    await expect(page.locator('footer.notice')).not.toContainText('no game art');
  });

  test(`report ${url}: the site bar stays on screen in both views`, async ({ page, request }) => {
    await page.goto(url);
    const bar = page.locator('nav.sitebar');
    for (const mode of ['viewer', 'full']) {
      if (mode === 'full') await page.locator('#modes [data-mode="full"]').click();
      await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
      await expect(bar).toBeInViewport();
      expect(Math.round((await bar.boundingBox()).y)).toBe(0);
    }
    await expect(bar.locator('a[href="/vgc/"]')).toBeVisible();
    await expect(bar.locator('a[href="/"]')).toBeVisible();
    for (const href of ['/vgc/', '/']) expect((await request.get(href)).status(), href).toBe(200);
  });

  test(`report ${url}: odd or hostile hashes never blank the page`, async ({ page }) => {
    // Object-prototype names and a malformed %-escape used to throw at start-up with the viewer's hiding already on.
    for (const h of ['#constructor', '#__proto__', '#toString', '#%E0%A4', '#nope', '#game99']) {
      await page.goto('about:blank');
      await page.goto(url + h);
      await expect(page.locator('article.turn:visible').first(), h).toBeVisible();
      await page.keyboard.press('ArrowRight');
    }
  });

  test(`report ${url}: in the full report the Game N links stay in the full report`, async ({ page }) => {
    await page.goto(url);
    await page.locator('#modes [data-mode="full"]').click();
    await page.locator('nav.toc a[href="#game1"]').click();
    await expect(page).toHaveURL(/#game1$/);
    await expect(page.locator('#teams')).toBeVisible();
    expect(await page.locator('article.turn:visible').count()).toBeGreaterThan(1);
  });

  test(`report ${url}: without JavaScript the page is the full report`, async ({ browser }) => {
    const ctx = await browser.newContext({ javaScriptEnabled: false });
    const page = await ctx.newPage();
    await page.goto(url);
    await expect(page.locator('#viewer')).toBeHidden();
    await expect(page.locator('#teams')).toBeVisible();
    expect(await page.locator('article.turn:visible').count()).toBeGreaterThan(3);
    await expect(page.locator('.xp-opts').first()).toBeVisible();
    await noHorizontalScroll(page);
    await ctx.close();
  });

  test(`report ${url} is anonymized and self-contained`, async ({ page }) => {
    const external = [];
    page.on('request', req => { if (!req.url().startsWith('http://127.0.0.1') && !req.url().startsWith('data:')) external.push(req.url()); });
    await page.goto(url);
    const html = await page.content();
    expect(html).not.toMatch(/replay\.pokemonshowdown\.com|\/mnt\/|\/home\/|palmeida/);
    expect(external).toEqual([]);
  });
}

// The ladder history pages (/vgc/ladder/, /pt/vgc/ladder/): rendered from the committed, anonymized /vgc/data/ladder.json.
const LADDER = [
  { url: '/vgc/ladder/', updated: /^Updated [A-Z][a-z]{2} \d{1,2}, 20\d\d$/, interim: 'Interim' },
  { url: '/pt/vgc/ladder/', updated: /^Atualizado em \d{1,2} [a-z]{3} 20\d\d$/, interim: 'Parcial' },
];

test('the landing pages link to the ladder history page', async ({ page }) => {
  await page.goto('/vgc/');
  await expect(page.locator('a[href="/vgc/ladder/"]')).toHaveCount(1);
  await page.goto('/pt/vgc/');
  await expect(page.locator('a[href="/pt/vgc/ladder/"]')).toHaveCount(1);
});

test('ladder.json is anonymous aggregates only', async ({ request }) => {
  const res = await request.get('/vgc/data/ladder.json');
  expect(res.status()).toBe(200);
  const raw = await res.text();
  const d = JSON.parse(raw);
  expect(d.bot).toBe('RNADy-Bot');
  expect(d.samples.length).toBeGreaterThanOrEqual(9);
  expect(d.series.points.length).toBeGreaterThan(1000);
  for (const bad of ['username', 'userid', 'opponent"', 'battle-', '/mnt', '/home', '@', 'checkpoint', 'password']) {
    expect(raw.toLowerCase(), bad).not.toContain(bad);
  }
});

for (const { url, updated, interim } of LADDER) {
  test(`ladder ${url}: chart, sample table, A/B table and the updated note render`, async ({ page, request }) => {
    await page.goto(url);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(page.locator('#ladder-chart svg[role="img"] polyline.lc-line')).toBeAttached();
    await expect(page.locator('#ladder-chart svg title')).not.toBeEmpty();
    await expect(page.locator('#ladder-samples tr')).toHaveCount(10);
    await expect(page.locator('#ladder-samples tr.row-interim')).toHaveCount(1);
    await expect(page.locator('#ladder-samples tr.row-interim')).toContainText(interim);
    await expect(page.locator('#ladder-ab tr')).toHaveCount(4);
    await expect(page.locator('#ladder-stats li')).toHaveCount(4);
    // on a desktop-width screen the A/B table fits without sideways scrolling (the effect column stays visible)
    if (page.viewportSize().width >= 1280) {
      const fits = await page.locator('#ladder-ab').evaluate(tb => { const w = tb.closest('.vgc-tablewrap'); return w.scrollWidth <= w.clientWidth; });
      expect(fits).toBe(true);
    }
    await expect(page.locator('#ladder-updated')).toHaveText(updated);
    await expect(page.locator('table th[scope="col"]').first()).toBeVisible();
    await noHorizontalScroll(page);
    const hrefs = await page.$$eval('a[href^="/"]', as => [...new Set(as.map(a => a.getAttribute('href').split('#')[0]))]);
    for (const href of hrefs) expect((await request.get(href)).status(), href).toBe(200);
  });

  for (const scheme of ['light', 'dark']) {
    test(`ladder ${url}: no serious accessibility violations (${scheme})`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme });
      await page.goto(url);
      await expect(page.locator('#ladder-samples tr')).toHaveCount(10);
      await noSeriousAxe(page);
    });
  }
}
