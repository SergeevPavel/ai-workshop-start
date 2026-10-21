// Runs docs/demo/<feature>/scenario.ts against the web view, with GitHub answering from
// tests/helpers.ts. Recording saves the video; writing saves the golden screenshots; checking
// compares the screenshots with the goldens, see sameScreenshot. All MUST run in the Playwright
// image: fonts differ between platforms, so goldens are Linux screenshots.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { inflateSync } from 'node:zlib';
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

/**
 * Records the video into `video`, or writes the goldens with `write`; with neither, checks against
 * them, fast. The goldens come from a run without the video, as the tests run the scenario.
 */
export async function runDemo(
  feature: string,
  { video, write = false, width = 1280, height = 720 }: { video?: string; write?: boolean; width?: number; height?: number } = {},
) {
  if (!inPlaywrightImage) throw new Error('Demos run in the Playwright image; see inDocker');
  if (video && write) throw new Error('Record the video or write the goldens, not both');
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
        if (write) return writeFileSync(golden, shot);
        if (video) return;
        if (!existsSync(golden)) throw new Error(`No golden ${relative(ROOT, golden)}; record the demo`);
        const { same, differing } = sameScreenshot(shot, readFileSync(golden));
        if (!same) {
          const actual = join(ROOT, 'test-results/demo', feature, `${name}.png`);
          mkdirSync(join(actual, '..'), { recursive: true });
          writeFileSync(actual, shot);
          throw new Error(`${relative(ROOT, golden)} differs in ${differing}; the actual screenshot is ${relative(ROOT, actual)}`);
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

/** A pixel differs when a channel moves by more than this, of 255: Chromium's anti-aliasing jitter is a level. */
const LEVEL_TOLERANCE = 2;
/** A screenshot differs when more than this share of its pixels differ: jitter is a few pixels, a change hundreds. */
const PIXEL_TOLERANCE = 1 / 10_000;

/**
 * Whether two screenshots show the same thing. Chromium rasters a curved edge a level lighter or
 * darker from one run to the next, the same page, the same image, so the bytes are not stable: the
 * card corners in `web-view-look/dark.png` differ in 14 pixels one run in five. A change in the
 * page moves hundreds of pixels by many levels, so a small tolerance on both tells them apart.
 */
export function sameScreenshot(actual: Buffer, expected: Buffer): { same: boolean; differing: string } {
  if (actual.equals(expected)) return { same: true, differing: 'nothing' };
  const a = decodePng(actual);
  const e = decodePng(expected);
  if (a.width !== e.width || a.height !== e.height) {
    return { same: false, differing: `size: ${a.width}x${a.height}, not ${e.width}x${e.height}` };
  }
  let differing = 0;
  for (let i = 0; i < a.pixels.length; i += 4) {
    for (let c = 0; c < 4; c++) {
      if (Math.abs(a.pixels[i + c] - e.pixels[i + c]) > LEVEL_TOLERANCE) {
        differing++;
        break;
      }
    }
  }
  const total = a.width * a.height;
  return { same: differing <= total * PIXEL_TOLERANCE, differing: `${differing} of ${total} pixels` };
}

/** The pixels of an 8-bit, non-interlaced PNG as RGBA rows, as Chromium writes screenshots. */
function decodePng(png: Buffer): { width: number; height: number; pixels: Uint8Array } {
  if (png.toString('latin1', 1, 4) !== 'PNG') throw new Error('Not a PNG');
  let width = 0;
  let height = 0;
  let channels = 0;
  const data: Buffer[] = [];
  for (let offset = 8; offset < png.length; ) {
    const length = png.readUInt32BE(offset);
    const type = png.toString('latin1', offset + 4, offset + 8);
    const chunk = png.subarray(offset + 8, offset + 8 + length);
    if (type === 'IHDR') {
      width = chunk.readUInt32BE(0);
      height = chunk.readUInt32BE(4);
      const [depth, colour, , , interlace] = chunk.subarray(8);
      channels = { 0: 1, 2: 3, 4: 2, 6: 4 }[colour] ?? 0;
      if (depth !== 8 || !channels || interlace) throw new Error(`Not an 8-bit, non-interlaced PNG: depth ${depth}, colour type ${colour}`);
    } else if (type === 'IDAT') data.push(chunk);
    offset += 12 + length;
  }
  const raw = inflateSync(Buffer.concat(data));
  const stride = width * channels;
  const rows = new Uint8Array(height * stride);
  // Each row starts with its filter: None, Sub, Up, Average or Paeth, undone against the row above.
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    const row = rows.subarray(y * stride, (y + 1) * stride);
    const above = y ? rows.subarray((y - 1) * stride, y * stride) : new Uint8Array(stride);
    for (let x = 0; x < stride; x++) {
      const left = x >= channels ? row[x - channels] : 0;
      const up = above[x];
      const upLeft = x >= channels ? above[x - channels] : 0;
      let predicted = 0;
      if (filter === 1) predicted = left;
      else if (filter === 2) predicted = up;
      else if (filter === 3) predicted = (left + up) >> 1;
      else if (filter === 4) {
        const p = left + up - upLeft;
        const [pa, pb, pc] = [Math.abs(p - left), Math.abs(p - up), Math.abs(p - upLeft)];
        predicted = pa <= pb && pa <= pc ? left : pb <= pc ? up : upLeft;
      }
      row[x] = raw[y * (stride + 1) + 1 + x] + predicted;
    }
  }
  // Every colour type as RGBA, so two screenshots compare pixel by pixel whatever Chromium chose.
  const pixels = new Uint8Array(width * height * 4);
  for (let i = 0, j = 0; i < rows.length; i += channels, j += 4) {
    const grey = channels < 3;
    pixels[j] = rows[i];
    pixels[j + 1] = grey ? rows[i] : rows[i + 1];
    pixels[j + 2] = grey ? rows[i] : rows[i + 2];
    pixels[j + 3] = channels % 2 === 0 ? rows[i + channels - 1] : 255;
  }
  return { width, height, pixels };
}
