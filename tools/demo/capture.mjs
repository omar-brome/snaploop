// Walks the running Snaploop app (http://localhost:5173) with Playwright,
// recording a mobile demo video, taking mobile + desktop screenshots, and
// logging step timestamps (timings.json) so encode.mjs can cut the GIF.
import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

// MODE=dark captures the same walkthrough with prefers-color-scheme: dark
// (the app's pre-paint theme script picks it up) and suffixes all outputs.
const MODE = process.env.MODE === 'dark' ? 'dark' : 'light';
const SUFFIX = MODE === 'dark' ? '-dark' : '';

const BASE = 'http://localhost:5173';
const OUT = path.resolve('out');
const SHOTS = path.join(OUT, 'shots');
const VIDEO = path.join(OUT, 'video');
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(SHOTS, { recursive: true });
fs.mkdirSync(VIDEO, { recursive: true });

const startedAt = Date.now();
const timings = {};
const mark = (name) => {
  timings[name] = (Date.now() - startedAt) / 1000;
  console.log(`[${timings[name].toFixed(1)}s] ${name}`);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function shot(page, name) {
  await page.screenshot({ path: path.join(SHOTS, `${name}${SUFFIX}.png`) });
  console.log(`  shot: ${name}${SUFFIX}.png`);
}

// Remote placeholder images (picsum/pravatar) can be slow on a cold cache —
// wait until at least `min` images have real pixels before shooting.
async function waitForImages(page, min = 5, timeout = 15000) {
  await page
    .waitForFunction(
      (want) => {
        const imgs = [...document.querySelectorAll('img')];
        if (imgs.length === 0) return false;
        const loaded = imgs.filter((i) => i.complete && i.naturalWidth > 0).length;
        return loaded >= Math.min(want, imgs.length);
      },
      min,
      { timeout }
    )
    .catch(() => console.warn('  (images still loading, shooting anyway)'));
}

async function login(page) {
  await page.goto(`${BASE}/login`);
  await page.waitForSelector('input[name="identifier"]');
  await sleep(1200);
  await page.locator('input[name="identifier"]').click();
  await page.keyboard.type('demo', { delay: 70 });
  await page.locator('input[name="password"]').click();
  await page.keyboard.type('password123', { delay: 55 });
  await sleep(400);
  await page.locator('button[type="submit"]').click();
  await page.waitForURL(`${BASE}/`, { timeout: 15000 });
}

const browser = await chromium.launch();

// ───────────── Mobile pass (video + screenshots) ─────────────
const mobile = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  colorScheme: MODE,
  recordVideo: { dir: VIDEO, size: { width: 390, height: 844 } },
});
const page = await mobile.newPage();

mark('login-page');
await page.goto(`${BASE}/login`);
await page.waitForSelector('input[name="identifier"]');
await sleep(1500);
await shot(page, 'mobile-01-login');
await page.locator('input[name="identifier"]').click();
await page.keyboard.type('demo', { delay: 70 });
await page.locator('input[name="password"]').click();
await page.keyboard.type('password123', { delay: 55 });
await sleep(300);
await page.locator('button[type="submit"]').click();
await page.waitForURL(`${BASE}/`, { timeout: 15000 });
mark('feed');
await waitForImages(page, 8);
await sleep(1500);
await shot(page, 'mobile-02-feed');
// slow scroll through a couple of posts
for (let i = 0; i < 5; i++) {
  await page.mouse.wheel(0, 420);
  await sleep(750);
}
await sleep(800);
await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'smooth' }));
await sleep(1200);

mark('story-viewer');
// open the first unseen (gradient-ring) story that is not "Your story"
const trayItem = page
  .locator('button:has(.bg-story-ring)')
  .filter({ hasNotText: 'Your story' })
  .first();
if (await trayItem.count()) {
  await trayItem.click();
  await sleep(2600);
  await shot(page, 'mobile-03-story');
  // advance one slide (tap right zone), then close
  const vp = page.viewportSize();
  await page.mouse.click(vp.width - 60, vp.height / 2);
  await sleep(2200);
  await page.keyboard.press('Escape');
  await sleep(800);
} else {
  console.warn('no story ring found, skipping viewer');
}

mark('explore');
await page.goto(`${BASE}/explore`);
await waitForImages(page, 6);
await sleep(1200);
await shot(page, 'mobile-04-explore');
await page.mouse.wheel(0, 700);
await sleep(1300);

mark('reels');
await page.goto(`${BASE}/reels`);
await sleep(4000); // give the video time to start
await shot(page, 'mobile-05-reels');

mark('messages');
await page.goto(`${BASE}/messages`);
await sleep(2000);
await shot(page, 'mobile-06-dm-inbox');
await page.getByText('Weekend plans').first().click();
await sleep(2000);
const composer = page.locator('textarea').first();
await composer.click();
await page.keyboard.type(
  MODE === 'dark' ? 'Dark mode looks 🔥' : 'This app was built by Claude 🤖✨',
  { delay: 55 }
);
await sleep(500);
await page.keyboard.press('Enter');
await sleep(1800);
await shot(page, 'mobile-07-dm-thread');

mark('notifications');
await page.goto(`${BASE}/notifications`);
await sleep(2500);
await shot(page, 'mobile-08-notifications');

mark('profile');
await page.goto(`${BASE}/demo`);
await waitForImages(page, 4);
await sleep(1200);
await shot(page, 'mobile-09-profile');
await page.mouse.wheel(0, 500);
await sleep(1200);

mark('create');
await page.goto(`${BASE}/create`);
await sleep(2000);
await shot(page, 'mobile-10-create');
await sleep(800);
mark('end');

// keep auth for the desktop pass, then finalize the video
const state = await mobile.storageState();
await page.close();
await mobile.close();
const videoFile = fs.readdirSync(VIDEO).find((f) => f.endsWith('.webm'));
fs.renameSync(path.join(VIDEO, videoFile), path.join(OUT, `mobile-demo${SUFFIX}.webm`));

// ───────────── Desktop pass (screenshots only) ─────────────
const desktop = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  deviceScaleFactor: 1.5,
  colorScheme: MODE,
  storageState: state,
});
const d = await desktop.newPage();

await d.goto(`${BASE}/`);
await d.waitForSelector('nav');
await waitForImages(d, 8);
await sleep(1200);
await shot(d, 'desktop-01-feed');

await d.goto(`${BASE}/explore`);
await sleep(3000);
await shot(d, 'desktop-02-explore');
// open the first explore tile -> post detail two-pane
const tile = d.locator('a[href^="/p/"]').first();
if (await tile.count()) {
  await tile.click();
  await sleep(3000);
  await shot(d, 'desktop-03-post-detail');
}

await d.goto(`${BASE}/messages`);
await sleep(1500);
await d.getByText('Weekend plans').first().click();
await sleep(2000);
await shot(d, 'desktop-04-messages');

await d.goto(`${BASE}/demo`);
await sleep(3000);
await shot(d, 'desktop-05-profile');

await desktop.close();
await browser.close();

fs.writeFileSync(path.join(OUT, `timings${SUFFIX}.json`), JSON.stringify(timings, null, 2));
console.log(`\nDone (${MODE}). Video: out/mobile-demo${SUFFIX}.webm, shots: out/shots/.`);
