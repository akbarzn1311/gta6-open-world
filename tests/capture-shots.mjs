// Port Verona — screenshot capture.
// Loads each staged scene (?shot=1..4) from the local server, waits for
// window.__shotReady, and saves a JPEG (quality 80) at 1280x800 into
// screenshots/. Run with serve.ts on :8080:
//   node tests/capture-shots.mjs
// Screenshots must stay under 256 KiB each — the script prints every size
// and fails the run when one is over.

import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';

const CHROME = '/home/hatch/shot-tool/chrome/linux-158.0.8127.36/chrome-linux64/chrome';
const BASE = process.env.PV_URL || 'http://127.0.0.1:8080/';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'screenshots');

const SHOTS = [
  ['1-start.jpg', '?shot=1'],
  ['2-drive.jpg', '?shot=2'],
  ['3-chase.jpg', '?shot=3'],
  ['4-mission.jpg', '?shot=4'],
];

mkdirSync(OUT, { recursive: true });

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--window-size=1280,800'],
});

let failed = 0;
try {
  for (const [name, query] of SHOTS) {
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 800 });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(BASE + query, { waitUntil: 'networkidle0', timeout: 30000 });
    await page.waitForFunction('window.__shotReady === true', { timeout: 30000 });
    await new Promise((r) => setTimeout(r, 350)); // let the frame settle
    const buf = await page.screenshot({ type: 'jpeg', quality: 80 });
    writeFileSync(join(OUT, name), buf);
    const kb = (buf.length / 1024).toFixed(1);
    const ok = buf.length <= 262144 && errors.length === 0;
    if (!ok) failed += 1;
    console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${name} ${kb} KiB${errors.length ? ' — ' + errors.slice(0, 2).join(' | ') : ''}`);
    await page.close();
  }
} finally {
  await browser.close();
}

console.log(failed ? `\n${failed} shot(s) failed` : '\nall 4 shots captured');
process.exit(failed ? 1 : 0);
