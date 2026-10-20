#!/usr/bin/env node
// Records docs/demo/<feature>/scenario.ts: the video, a GIF of it for the pull request and the
// golden screenshots, next to it. Records in the Playwright image, through Docker outside it;
// converts on the host. The goldens come from a second run, without the video, as the tests run
// the scenario; see runDemo.
//
//   node .claude/skills/demo-video/record.ts <feature> [--size 1280x720]
import { spawnSync } from 'node:child_process';
import { existsSync, rmSync } from 'node:fs';
import { join, relative } from 'node:path';
import { parseArgs } from 'node:util';
import { DEMOS, inDocker, inPlaywrightImage, runDemo } from '../../../tests/demo.ts';

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    size: { type: 'string', default: '1280x720' },
  },
});

const usage = 'Usage: node .claude/skills/demo-video/record.ts <feature> [--size 1280x720]';
const [feature] = positionals;
if (positionals.length !== 1 || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(feature)) {
  console.error(`Expected one feature name in kebab-case, e.g. copies-list\n\n${usage}`);
  process.exit(1);
}
const folder = join(DEMOS, feature);
if (!existsSync(join(folder, 'scenario.ts'))) {
  console.error(`No scenario: ${join(folder, 'scenario.ts')}\n\n${usage}`);
  process.exit(1);
}
const [width, height] = values.size.split('x').map(Number);
if (!(width > 0 && height > 0)) throw new Error(`Not a size: ${values.size}; expected e.g. 1280x720`);

const mp4 = join(folder, 'demo.mp4');
const gif = join(folder, 'demo.gif');
const webm = join(folder, 'demo.webm');
// One recording per feature: a re-record MUST NOT leave an older file behind.
for (const file of [mp4, gif, webm]) rmSync(file, { force: true });
if (inPlaywrightImage) {
  await runDemo(feature, { video: webm, width, height });
  await runDemo(feature, { write: true, width, height });
} else {
  const docker = inDocker([
    '--input-type=module',
    '-e',
    "const [feature, video, width, height] = process.argv.slice(1); const { runDemo } = await import('./tests/demo.ts'); await runDemo(feature, { video, width: +width, height: +height }); await runDemo(feature, { write: true, width: +width, height: +height });",
    feature,
    relative(join(DEMOS, '../..'), webm),
    String(width),
    String(height),
  ]);
  if (docker.status !== 0) process.exit(docker.status ?? 1);
}

const ffmpeg = (...args: string[]) => {
  const run = spawnSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', webm, ...args], { stdio: 'inherit' });
  return !run.error && run.status === 0;
};
const converted =
  // H.264 in .mp4 plays everywhere, QuickTime included; WebM does not.
  ffmpeg('-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-an', mp4) &&
  // The GIF is for the pull request: GitHub shows an image inline, a video only as a link.
  // 10 fps, 960 px wide and a palette from the changes between frames keep it under a few MB;
  // no dithering, as the page is flat colour and dithering would only add noise and bytes.
  ffmpeg(
    '-vf',
    'fps=10,scale=960:-1:flags=lanczos,split[a][b];[a]palettegen=stats_mode=diff[p];' +
      '[b][p]paletteuse=dither=none:diff_mode=rectangle',
    gif,
  );
if (converted) {
  rmSync(webm);
  console.log(`${mp4}\n${gif}`);
} else {
  rmSync(mp4, { force: true });
  rmSync(gif, { force: true });
  console.error(`ffmpeg failed or is not installed; kept the WebM, no GIF: ${webm}`);
  process.exitCode = 1;
}
