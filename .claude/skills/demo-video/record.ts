#!/usr/bin/env node
// Records a short video of the web view: starts the server, opens the page, hands it to
// docs/demo/<feature>/scenario.ts and saves the video next to it. Headless, so the same on macOS,
// Linux and CI.
//
//   node .claude/skills/demo-video/record.ts <feature> [--recorded] [--webm] [--size 1280x720]
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { chromium, type Locator, type Page } from 'playwright';
import { openGitHub } from '../../../src/core/github.ts';
import { startWeb } from '../../../src/server.ts';

export type Demo = {
  /** Open at the web view's root URL. */
  page: Page;
  /** Moves the visible cursor to the middle of `target`, slowly enough to follow. */
  point(target: Locator): Promise<void>;
  /** Points at `target` and clicks it. */
  click(target: Locator): Promise<void>;
  /** Points at `target` and types `text` into it, key by key. */
  type(target: Locator, text: string): Promise<void>;
  /** Holds the frame, so the viewer can read it. */
  pause(ms?: number): Promise<void>;
};

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    recorded: { type: 'boolean', default: false },
    webm: { type: 'boolean', default: false },
    size: { type: 'string', default: '1280x720' },
  },
});

const usage = 'Usage: node .claude/skills/demo-video/record.ts <feature> [--recorded] [--webm] [--size 1280x720]';
const [feature] = positionals;
if (positionals.length !== 1 || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(feature)) {
  console.error(`Expected one feature name in kebab-case, e.g. copies-list\n\n${usage}`);
  process.exit(1);
}
const folder = fileURLToPath(new URL(`../../../docs/demo/${feature}/`, import.meta.url));
const scenarioFile = join(folder, 'scenario.ts');
if (!existsSync(scenarioFile)) {
  console.error(`No scenario: ${scenarioFile}\n\n${usage}`);
  process.exit(1);
}
const scenario: (demo: Demo) => Promise<void> = (await import(pathToFileURL(scenarioFile).href)).default;

const [width, height] = values.size.split('x').map(Number);
if (!(width > 0 && height > 0)) throw new Error(`Not a size: ${values.size}; expected e.g. 1280x720`);

// --recorded answers from the test recordings: no network, the same video every time.
const open = values.recorded
  ? (await import('../../../tests/helpers.ts')).open
  : (input: string) => openGitHub(input, { fetch, token: process.env.GITHUB_TOKEN || undefined });

const web = await startWeb({ open });
const videos = mkdtempSync(join(tmpdir(), 'demo-video-'));
const browser = await chromium.launch();
try {
  const context = await browser.newContext({
    viewport: { width, height },
    recordVideo: { dir: videos, size: { width, height } },
  });
  // Headless video has no mouse pointer; this dot stands in for it. Only in the recording.
  // A string, as it runs in the page: the project has no DOM types.
  await context.addInitScript({
    content: `addEventListener('DOMContentLoaded', () => {
      const dot = document.createElement('div');
      dot.style.cssText = 'position:fixed;z-index:2147483647;width:18px;height:18px;' +
        'margin:-9px 0 0 -9px;border-radius:50%;background:rgba(220,40,40,.55);border:2px solid #fff;' +
        'pointer-events:none;transition:transform .12s';
      // Kept across page loads: a form submit MUST NOT hide the pointer until the next move.
      [dot.style.left, dot.style.top] = (sessionStorage.getItem('demo-cursor') ?? '-40px -40px').split(' ');
      document.body.append(dot);
      addEventListener('mousemove', (event) => {
        dot.style.left = event.clientX + 'px';
        dot.style.top = event.clientY + 'px';
        sessionStorage.setItem('demo-cursor', dot.style.left + ' ' + dot.style.top);
      }, true);
      addEventListener('mousedown', () => (dot.style.transform = 'scale(.7)'), true);
      addEventListener('mouseup', () => (dot.style.transform = ''), true);
    });`,
  });
  const page = await context.newPage();
  const pause = (ms = 1000) => page.waitForTimeout(ms);
  const point = async (target: Locator) => {
    const box = await target.boundingBox();
    if (!box) throw new Error(`Not visible: ${target}`);
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 25 });
  };
  await page.goto(web.url);
  await scenario({
    page,
    pause,
    point,
    click: async (target) => {
      await point(target);
      await pause(250);
      await target.click();
    },
    type: async (target, text) => {
      await point(target);
      await target.click();
      await target.pressSequentially(text, { delay: 45 });
      await pause(400);
    },
  });
  const video = page.video();
  await context.close();
  const webm = await video!.path();

  const mp4 = join(folder, 'demo.mp4');
  const kept = join(folder, 'demo.webm');
  // One video per feature: a re-record MUST NOT leave the other format behind.
  rmSync(mp4, { force: true });
  rmSync(kept, { force: true });
  if (values.webm) {
    copyFileSync(webm, kept);
    console.log(kept);
  } else {
    // H.264 in .mp4 plays everywhere, QuickTime included; WebM does not.
    const ffmpeg = spawnSync(
      'ffmpeg',
      ['-y', '-loglevel', 'error', '-i', webm, '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-an', mp4],
      { stdio: 'inherit' },
    );
    if (ffmpeg.error || ffmpeg.status !== 0) {
      rmSync(mp4, { force: true });
      copyFileSync(webm, kept);
      console.error(`ffmpeg failed or is not installed; kept the WebM: ${kept}`);
      process.exitCode = 1;
    } else {
      console.log(mp4);
    }
  }
} finally {
  await browser.close();
  await web.close();
  rmSync(videos, { recursive: true, force: true });
}
