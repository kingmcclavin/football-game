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
await page.addInitScript(() => localStorage.setItem('gl-settings', JSON.stringify({ quarterMinutes: 2, autoContinue: true, sound: false, music: false, showGuide: false, tutorialsSeen: ['QB', 'RB', 'REC', 'DEF', 'K'] })));
await page.goto(URL);
await page.getByText('New Career').click();
await page.getByText('Quick Start').click();
await page.locator('button.option').filter({ has: page.locator('b', { hasText: /^RB$/ }) }).first().click();
await page.getByText('Start Career').click();
await page.getByText('Play Game').click();
await page.getByText('Heads').click();
if (await page.locator('button', { hasText: /^Receive$/ }).count()) await page.locator('button', { hasText: /^Receive$/ }).click(); else await page.locator('button', { hasText: /^Kick Off$/ }).click();
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

// Second pass: a quarterback career shows the first-time tutorial and throws with drag-to-aim.
const ctx2 = await browser.newContext({ viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
const qb = await ctx2.newPage();
qb.on('pageerror', (e) => errors.push(e.message));
qb.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await qb.addInitScript(() => localStorage.setItem('gl-settings', JSON.stringify({ quarterMinutes: 2, autoContinue: true, sound: false, music: false, tutorialsSeen: [] })));
await qb.goto(URL);
await qb.getByText('New Career').click();
await qb.getByText('Quick Start').click();
await qb.locator('button.option').filter({ has: qb.locator('b', { hasText: /^QB$/ }) }).first().click();
await qb.getByText('Start Career').click();
await qb.getByText('Play Game').click();
const sawTutorial = await qb.locator('.tutorial').isVisible();
await qb.locator('.tutorial button:has-text("Skip")').click();
await qb.getByText('Tails').click();
if (await qb.locator('button', { hasText: /^Receive$/ }).count()) await qb.locator('button', { hasText: /^Receive$/ }).click(); else await qb.locator('button', { hasText: /^Kick Off$/ }).click();
let throws = 0;
const t1 = Date.now();
while (Date.now() - t1 < 120000 && throws < 3) {
  const click = async (sel) => {
    const l = qb.locator(sel).first();
    if ((await l.count()) && (await l.isVisible().catch(() => false))) { await l.click().catch(() => {}); return true; }
    return false;
  };
  if (await click('button:has-text("Back on the Field")')) continue;
  if (await click('button:has-text("Start Second Half")')) continue;
  if (await click("button:has-text(\"Coach's Call\")")) continue;
  if (await click('.box button:has-text("Continue")')) break;
  if (await qb.locator('.abtn:has-text("SNAP"), .abtn:has-text("READY")').count()) await qb.keyboard.press('Space');
  if (await qb.locator('.aimhint').count()) {
    await qb.waitForTimeout(900);
    if (await qb.locator('.aimhint').count()) {
      await qb.mouse.move(560, 200); await qb.mouse.down(); await qb.mouse.move(430, 240, { steps: 6 }); await qb.waitForTimeout(150); await qb.mouse.up();
      throws++;
    }
  }
  await qb.waitForTimeout(300);
}
console.log(`QB tutorial shown: ${sawTutorial}, drag throws: ${throws}`);
await browser.close();
if (!sawTutorial) { console.error('Tutorial did not appear'); process.exit(1); }
if (!throws) { console.error('No drag-to-aim throw happened'); process.exit(1); }
if (errors.length) { console.error(errors.join('\n')); process.exit(1); }
if (!finished) { console.error('Game did not finish in time'); process.exit(1); }
console.log('E2E OK');
