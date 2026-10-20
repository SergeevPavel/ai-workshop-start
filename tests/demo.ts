// Runs docs/demo/<feature>/scenario.ts against the web view, with GitHub answering from
// tests/helpers.ts. Recording saves the video and the golden screenshots; checking compares the
// screenshots with the goldens. Both MUST run in the Playwright image: fonts differ between
// platforms, so goldens are Linux screenshots.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium, type Locator, type Page } from 'playwright';
import { startWeb } from '../src/server.ts';
import { open } from './helpers.ts';

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
  /** A key point: the viewport MUST match `docs/demo/<feature>/<name>.png`. */
  snapshot(name: string): Promise<void>;
};

const ROOT = fileURLToPath(new URL('..', import.meta.url));
export const DEMOS = join(ROOT, 'docs/demo');

/** Inside the Playwright image, where the browsers live in /ms-playwright. */
export const inPlaywrightImage = process.env.PLAYWRIGHT_BROWSERS_PATH === '/ms-playwright';

/** Runs `node <args>` in the Playwright image matching the installed `playwright`, with the repository mounted. */
export function inDocker(args: string[], stdio: 'inherit' | 'pipe' = 'inherit') {
  const { version } = JSON.parse(readFileSync(join(ROOT, 'node_modules/playwright/package.json'), 'utf8'));
  const user = process.getuid && process.getgid ? ['--user', `${process.getuid()}:${process.getgid()}`, '-e', 'HOME=/tmp'] : [];
  const docker = spawnSync(
    'docker',
    ['run', '--rm', '--init', ...user, '-v', `${ROOT}:/work`, '-w', '/work', `mcr.microsoft.com/playwright:v${version}-noble`, 'node', ...args],
    { stdio, encoding: 'utf8' },
  );
  if (docker.error) throw new Error(`Docker is needed outside the Playwright image: ${docker.error.message}`);
  return docker;
}

/** Records the video into `video` and writes the goldens; without `video`, checks against them, fast. */
export async function runDemo(feature: string, { video, width = 1280, height = 720 }: { video?: string; width?: number; height?: number } = {}) {
  if (!inPlaywrightImage) throw new Error('Demos run in the Playwright image; see inDocker');
  const folder = join(DEMOS, feature);
  const scenario: (demo: Demo) => Promise<void> = (await import(pathToFileURL(join(folder, 'scenario.ts')).href)).default;
  const web = await startWeb({ open });
  const videos = mkdtempSync(join(tmpdir(), 'demo-video-'));
  const browser = await chromium.launch();
  try {
    const context = await browser.newContext({
      viewport: { width, height },
      ...(video && { recordVideo: { dir: videos, size: { width, height } } }),
    });
    // Headless video has no mouse pointer; this dot stands in for it. Only in the recording.
    // A string, as it runs in the page: the project has no DOM types.
    if (video) {
      await context.addInitScript({
        content: `addEventListener('DOMContentLoaded', () => {
          const dot = document.createElement('div');
          dot.id = 'demo-cursor';
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
    }
    const page = await context.newPage();
    // Checking skips the pacing: the same steps, the same frames, no waiting.
    const pause = async (ms = 1000) => {
      if (video) await page.waitForTimeout(ms);
    };
    const point = async (target: Locator) => {
      const box = await target.boundingBox();
      if (!box) throw new Error(`Not visible: ${target}`);
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: video ? 25 : 1 });
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
        await target.pressSequentially(text, { delay: video ? 45 : 0 });
        await pause(400);
      },
      snapshot: async (name) => {
        const shot = await page.screenshot({ animations: 'disabled', caret: 'hide', style: '#demo-cursor { display: none }' });
        const golden = join(folder, `${name}.png`);
        if (video) return writeFileSync(golden, shot);
        if (!existsSync(golden)) throw new Error(`No golden ${relative(ROOT, golden)}; record the demo`);
        if (!shot.equals(readFileSync(golden))) {
          const actual = join(ROOT, 'test-results/demo', feature, `${name}.png`);
          mkdirSync(join(actual, '..'), { recursive: true });
          writeFileSync(actual, shot);
          throw new Error(`${relative(ROOT, golden)} differs; the actual screenshot is ${relative(ROOT, actual)}`);
        }
      },
    });
    const recorded = page.video();
    await context.close();
    if (recorded && video) await recorded.saveAs(video);
  } finally {
    await browser.close();
    await web.close();
    rmSync(videos, { recursive: true, force: true });
  }
}
