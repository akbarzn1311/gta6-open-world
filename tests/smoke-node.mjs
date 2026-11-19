// Port Verona — node smoke test.
// Run from the repository root: node tests/smoke-node.mjs
// Checks: every deliverable file exists, every game script parses under
// Node 22, and main.ts hands the entry in (copies game/ + screenshots/ and
// writes a valid dossier.json) into a scratch output directory.

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const NODE = process.execPath;

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

const EXPECTED = [
  'main.ts',
  'serve.ts',
  'README.md',
  'LICENSE',
  'shots.json',
  'vendor/makefun-game.ts',
  'game/index.html',
  'game/vendor/three.min.js',
  'game/src/util.js',
  'game/src/audio.js',
  'game/src/city.js',
  'game/src/vehicles.js',
  'game/src/characters.js',
  'game/src/missions.js',
  'game/src/police.js',
  'game/src/combat.js',
  'game/src/hud.js',
  'game/src/save.js',
  'game/src/game.js',
  'game/src/shots.js',
];

console.log('files:');
EXPECTED.forEach((f) => check(f, existsSync(join(ROOT, f))));

console.log('parse (node --check):');
readdirSync(join(ROOT, 'game/src'))
  .filter((f) => f.endsWith('.js'))
  .forEach((f) => {
    try {
      execFileSync(NODE, ['--check', join(ROOT, 'game/src', f)], { stdio: 'pipe' });
      check('game/src/' + f, true);
    } catch (e) {
      check('game/src/' + f, false, String(e.stderr || e.message).split('\n')[0]);
    }
  });
try {
  execFileSync(NODE, ['--check', join(ROOT, 'serve.ts')], { stdio: 'pipe' });
  check('serve.ts', true);
} catch (e) {
  check('serve.ts', false, String(e.stderr || e.message).split('\n')[0]);
}

console.log('hand-in (main.ts -> scratch output):');
const OUT = '/tmp/pv-smoke-out';
try {
  execFileSync('rm', ['-rf', OUT], { stdio: 'pipe' });
  execFileSync(NODE, ['main.ts'], { cwd: ROOT, stdio: 'pipe', env: { ...process.env, OUTPUT_DIR: OUT } });
  const dossier = JSON.parse(readFileSync(join(OUT, 'dossier.json'), 'utf8'));
  check('dossier.json written', true);
  check('dossier schema', dossier.schema === 'makefun/dossier/v1', dossier.schema);
  check('game/ copied', existsSync(join(OUT, 'game/index.html')));
  const shots = readdirSync(join(OUT, 'screenshots')).filter((f) => /\.(jpe?g|png)$/i.test(f));
  check('screenshots copied (' + shots.length + ')', shots.length >= 3 && shots.length <= 4);
  shots.forEach((s) => {
    const bytes = statSync(join(OUT, 'screenshots', s)).size;
    check('screenshot ' + s + ' <= 256 KiB (' + bytes + ' B)', bytes <= 262144);
  });
  const textBytes = Buffer.byteLength(dossier.text ?? '', 'utf8');
  check('dossier text <= 160 KiB (' + textBytes + ' B)', textBytes <= 163840);
} catch (e) {
  check('main.ts hand-in', false, String(e.stderr || e.message).split('\n').slice(0, 3).join(' | '));
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
