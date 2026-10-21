#!/usr/bin/env node
// Records a bug's reproduction, test-results/red-agent/<slug>/scenario.ts, as the demo-video skill
// records a feature: the video, a GIF of it and a screenshot at each `snapshot`, next to the scenario.
// Not in docs/demo: a golden there would make the bug the acceptance test. Records in the Playwright
// image, through Docker outside it; converts on the host; copies the folder into AIR_ARTIFACTS_DIR.
//
//   node .claude/skills/red-agent/record.ts <slug> [--live] [--size 1280x720]
//
// --live: the web view opens repositories on GitHub itself, with GITHUB_TOKEN as src/web.ts does,
// instead of the recordings in tests/helpers.ts: for a bug that needs a real repository.
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, readdirSync, rmSync } from 'node:fs';
import { join, relative } from 'node:path';
import { parseArgs } from 'node:util';
import { openGitHub } from '../../../src/core/github.ts';
import { DEMOS, inDocker, inPlaywrightImage, runDemo } from '../../../tests/demo.ts';

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    live: { type: 'boolean', default: false },
    size: { type: 'string', default: '1280x720' },
  },
});

const usage = 'Usage: node .claude/skills/red-agent/record.ts <slug> [--live] [--size 1280x720]';
const [slug] = positionals;
if (positionals.length !== 1 || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)) {
  console.error(`Expected one slug in kebab-case, e.g. fork-scan-zero-skills\n\n${usage}`);
  process.exit(1);
}
const ROOT = join(DEMOS, '../..');
const folder = join(ROOT, 'test-results/red-agent', slug);
if (!existsSync(join(folder, 'scenario.ts'))) {
  console.error(`No scenario: ${join(folder, 'scenario.ts')}\n\n${usage}`);
  process.exit(1);
}
const [width, height] = values.size.split('x').map(Number);
if (!(width > 0 && height > 0)) throw new Error(`Not a size: ${values.size}; expected e.g. 1280x720`);
const token = process.env.GITHUB_TOKEN || undefined;
if (values.live && !token) console.error('GITHUB_TOKEN is not set: the page lists the tree, not code search. GITHUB_TOKEN=$(gh auth token) sets it.');

const mp4 = join(folder, 'demo.mp4');
const gif = join(folder, 'demo.gif');
const webm = join(folder, 'demo.webm');
// One recording per bug: a re-record MUST NOT leave an older file or screenshot behind.
for (const file of readdirSync(folder)) {
  if (/\.(mp4|gif|webm|png)$/.test(file)) rmSync(join(folder, file), { force: true });
}
if (inPlaywrightImage) {
  const open = values.live ? (input: string) => openGitHub(input, { fetch, token }) : undefined;
  await runDemo(slug, { video: webm, width, height, folder, open });
  await runDemo(slug, { write: true, width, height, folder, open });
} else {
  const docker = inDocker(
    [
      '--input-type=module',
      '-e',
      "const [slug, folder, live, width, height] = process.argv.slice(1);" +
        " const { runDemo } = await import('./tests/demo.ts');" +
        " const { openGitHub } = await import('./src/core/github.ts');" +
        " const open = live === 'live' ? (input) => openGitHub(input, { fetch, token: process.env.GITHUB_TOKEN || undefined }) : undefined;" +
        " await runDemo(slug, { video: folder + '/demo.webm', width: +width, height: +height, folder, open });" +
        " await runDemo(slug, { write: true, width: +width, height: +height, folder, open });",
      slug,
      relative(ROOT, folder),
      values.live ? 'live' : 'recorded',
      String(width),
      String(height),
    ],
    'inherit',
    values.live ? ['GITHUB_TOKEN'] : [],
  );
  if (docker.status !== 0) process.exit(docker.status ?? 1);
}

const ffmpeg = (...args: string[]) => {
  const run = spawnSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', webm, ...args], { stdio: 'inherit' });
  return !run.error && run.status === 0;
};
// The same files as the demo-video skill makes: an .mp4 that plays everywhere and a GIF GitHub shows inline.
const converted =
  ffmpeg('-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-an', mp4) &&
  ffmpeg(
    '-vf',
    'fps=10,scale=960:-1:flags=lanczos,split[a][b];[a]palettegen=stats_mode=diff[p];' +
      '[b][p]paletteuse=dither=none:diff_mode=rectangle',
    gif,
  );
if (!converted) {
  rmSync(mp4, { force: true });
  rmSync(gif, { force: true });
  console.error(`ffmpeg failed or is not installed; kept the WebM, no GIF: ${webm}`);
  process.exitCode = 1;
} else rmSync(webm);
for (const file of readdirSync(folder).sort()) console.log(join(folder, file));
// The artifacts of an Air session outlive it; the folder lands there as red-agent/<slug>.
if (process.env.AIR_ARTIFACTS_DIR) {
  const copy = join(process.env.AIR_ARTIFACTS_DIR, 'red-agent', slug);
  cpSync(folder, copy, { recursive: true });
  console.log(`copied to ${copy}`);
}
