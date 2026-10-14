// Browser smoke test: creates a career, plays a short game and checks for runtime errors.
// Usage: start `npm run preview` (port 4173) or `npm run dev` (port 5173), then `npm run e2e`.
// Set E2E_URL to override the address.
import { chromium } from 'playwright';

const URL = process.env.E2E_URL ?? 'http://localhost:4173/';
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await page.addInitScript(() => localStorage.setItem('gl-settings', JSON.stringify({ quarterMinutes: 2, autoContinue: true, sound: false, showGuide: false })));
await page.goto(URL);
await page.getByText('New Career').click();
await page.getByText('Quick Start').click();
await page.locator('button.option').filter({ has: page.locator('b', { hasText: /^RB$/ }) }).first().click();
await page.getByText('Start Career').click();
await page.getByText('Play Game').click();
await page.getByText('Kick Off').click();
const t0 = Date.now();
let snaps = 0;
while (Date.now() - t0 < 240000) {
  if (await page.locator('.chip', { hasText: /VICTORY|DEFEAT|TIE/ }).count()) break;
  const click = async (sel) => {
    const l = page.locator(sel).first();
    if ((await l.count()) && (await l.isVisible().catch(() => false))) { await l.click().catch(() => {}); return true; }
    return false;
  };
  if (await click('button:has-text("Back on the Field")')) continue;
  if (await click('button:has-text("Start Second Half")')) continue;
  if (await click("button:has-text(\"Coach's Call\")")) continue;
  if (await click('.box button:has-text("Continue")')) continue;
  if (await page.locator('.abtn:has-text("SNAP"), .abtn:has-text("READY")').count()) {
    await page.keyboard.press('Space');
    snaps++;
  }
  await page.waitForTimeout(400);
}
const finished = await page.locator('.chip', { hasText: /VICTORY|DEFEAT|TIE/ }).count();
console.log(`snaps: ${snaps}, finished: ${finished > 0}, errors: ${errors.length}`);
await browser.close();
if (errors.length) { console.error(errors.join('\n')); process.exit(1); }
if (!finished) { console.error('Game did not finish in time'); process.exit(1); }
console.log('E2E OK');
