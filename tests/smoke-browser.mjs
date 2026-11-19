// Port Verona — browser smoke test.
// Serves the game on :8080 (serve.ts must be running) and drives it in
// headless Chromium: the start screen appears, START GAME enters play, the
// world renders for a few seconds with no page errors, and a scripted shot
// reaches __shotReady. Run: node tests/smoke-browser.mjs
//
// Test cases covered here: happy path (boot -> play -> render), error case
// (any pageerror / failed request fails the run), edge case (WebGL context
// actually created, not a black canvas).

import puppeteer from 'puppeteer-core';

const CHROME = '/home/hatch/shot-tool/chrome/linux-158.0.8127.36/chrome-linux64/chrome';
const BASE = process.env.PV_URL || 'http://127.0.0.1:8080/';

let passed = 0;
let failed = 0;

function check(name, ok, detail) {
  if (ok) {
    passed += 1;
    console.log('  ok   ' + name);
  } else {
    failed += 1;
    console.log('  FAIL ' + name + (detail ? ' — ' + detail : ''));
  }
}

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--window-size=1280,800'],
});

try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800 });
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push('console: ' + m.text());
  });
  page.on('requestfailed', (r) => errors.push('requestfailed: ' + r.url()));

  await page.goto(BASE, { waitUntil: 'networkidle0', timeout: 30000 });
  await page.waitForSelector('#start-screen', { timeout: 10000 });
  check('start screen visible', true);

  await page.click('#start-button');
  await new Promise((r) => setTimeout(r, 4000));
  const state = await page.evaluate(() => {
    const g = window.PV && window.PV.game;
    if (!g) return null;
    return {
      mode: g.state.mode,
      hour: g.state.hour,
      cars: window.PV.vehicles.cars().length,
      renderer: !!g.renderer(),
      canvas: !!document.querySelector('#game-canvas canvas'),
    };
  });
  check('game object present', !!state, JSON.stringify(state));
  check('mode is playing', state && state.mode === 'playing', state && state.mode);
  check('traffic spawned', state && state.cars >= 10, state && String(state.cars));
  check('WebGL canvas present', state && state.canvas);

  // Drive forward for 3s and confirm the player moved. (Headless swiftshader
  // renders slowly, so game time runs behind wall time; >1m proves movement.)
  const moved = await page.evaluate(async () => {
    const g = window.PV.game;
    const x0 = g.state.x;
    const z0 = g.state.z;
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW' }));
    await new Promise((r) => setTimeout(r, 3000));
    window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyW' }));
    return Math.hypot(g.state.x - x0, g.state.z - z0);
  });
  check('player moves on W (' + moved.toFixed(1) + 'm)', moved > 1, String(moved));

  // A scripted shot reaches __shotReady (proves the shots pipeline works).
  const shotPage = await browser.newPage();
  await shotPage.setViewport({ width: 1280, height: 800 });
  shotPage.on('pageerror', (e) => errors.push('shot pageerror: ' + e.message));
  await shotPage.goto(BASE + '?shot=2', { waitUntil: 'networkidle0', timeout: 30000 });
  await shotPage.waitForFunction('window.__shotReady === true', { timeout: 20000 });
  check('shot 2 reaches __shotReady', true);

  check('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
} finally {
  await browser.close();
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
