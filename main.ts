// Solmar Bay — a hand-built entry for make.fun's "Make GTA 6" bounty
// (gta6-01). The game itself is plain static files under game/: a
// three.js open-world crime game that runs offline in desktop Chrome
// (game/index.html plus its ES modules, with three.js vendored under
// game/vendor/). This program hands the entry in: it copies game/ and
// screenshots/ from beside this file into /output (or the directory
// named by MAKEFUN_OUTPUT_DIR) and writes /output/dossier.json, the
// summary the judge reads, using the vendored make.fun library.
//
// Play it locally first: `node serve.ts`, then open http://localhost:8080.
// Hand it in locally with:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const repoRoot = fileURLToPath(new URL('.', import.meta.url));
const outputDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

function copyTree(from, to) {
  mkdirSync(to, { recursive: true });
  cpSync(from, to, { recursive: true });
}

mkdirSync(outputDir, { recursive: true });
copyTree(join(repoRoot, 'game'), join(outputDir, 'game'));
if (existsSync(join(repoRoot, 'screenshots'))) {
  copyTree(join(repoRoot, 'screenshots'), join(outputDir, 'screenshots'));
}

// The gate's own caps, so a bad entry fails here instead of at the
// scorer: at most 4 screenshots of 256 KiB each, game/ at most 993
// files and 48 MiB in all, and the dossier text capped at 160 KiB.
const dossier = buildDossier(outputDir, {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000,
});
writeFileSync(join(outputDir, 'dossier.json'), dossier);
