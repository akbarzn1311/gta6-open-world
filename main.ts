// Port Verona — "Make GTA 6" (gta6-01) entry program.
//
// What this program does: it hands in the game this repository built. It copies
// game/ (the playable game as static files) and screenshots/ (3 or 4 renders of
// the game) from this repository into the output directory, then writes
// /output/dossier.json with the kit library's buildDossier, so the scorer can
// read the entry exactly as the program handed it in.
//
// Run it with Node 22, from this repository's root:
//
//   node main.ts
//
// The output directory is /output unless OUTPUT_DIR names another one (handy
// for a local check: OUTPUT_DIR=/tmp/out node main.ts).

import { copyFileSync, mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

/** The directory this file lives in: the repository's root. */
const repoRoot = dirname(fileURLToPath(import.meta.url));

/** Where the entry is handed in: /output, or OUTPUT_DIR when set. */
const outDir = process.env.OUTPUT_DIR ?? '/output';

/** The caps the bounty's gate hands buildDossier (reference/gate.json). */
const DOSSIER_CAPS = {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
} as const;

/** Copy one directory tree into another, creating directories as needed. */
function copyTree(srcDir: string, destDir: string): number {
  let copied = 0;
  mkdirSync(destDir, { recursive: true });
  for (const name of readdirSync(srcDir)) {
    const src = join(srcDir, name);
    const dest = join(destDir, name);
    if (statSync(src).isDirectory()) {
      copied += copyTree(src, dest);
    } else {
      copyFileSync(src, dest);
      copied += 1;
    }
  }
  return copied;
}

function main(): void {
  const gameFiles = copyTree(join(repoRoot, 'game'), join(outDir, 'game'));
  const shotFiles = copyTree(join(repoRoot, 'screenshots'), join(outDir, 'screenshots'));
  const dossier = buildDossier(outDir, DOSSIER_CAPS);
  writeFileSync(join(outDir, 'dossier.json'), dossier);
  console.log(`handed in ${gameFiles} game file(s) and ${shotFiles} screenshot(s) to ${outDir}`);
  console.log(`dossier.json: ${dossier.length} bytes`);
}

main();
