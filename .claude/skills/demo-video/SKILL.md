---
name: demo-video
description: Record a short video demo of a web view feature, with a GIF of it for the pull request and golden screenshots that make it an acceptance test. Use when asked for a demo, screencast, video or GIF of the web page, e.g. for a pull request.
---

# Demo video

A demo is a video and an acceptance test. `record.ts` starts the web view, opens the page in a headless
Chromium, runs a scenario, saves the video with a GIF of it and, at each `snapshot`, a golden screenshot.
`npm test` runs every scenario again and compares the screenshots with the goldens, byte for byte.
GitHub answers from `tests/helpers.ts` (`https://github.com/JetBrains/fixture`, `…/example`): offline, repeatable.

Fonts differ between platforms, so goldens are Linux screenshots from the Playwright image, the version of
`playwright` in `package-lock.json`. Outside it, recording and the tests run in it through Docker; CI runs in it.

Each feature has its own folder, committed with the change:

```
docs/demo/<feature>/
  scenario.ts   what the video shows
  <name>.png    a golden, one per snapshot
  demo.mp4      the recording
  demo.gif      the same at 10 fps, 960 px wide: for the pull request, where GitHub shows a GIF inline but a video only as a link
```

`<feature>` is kebab-case and names the feature, e.g. `copies-list`. Re-recording replaces the video, the GIF and the goldens.

## 1. Set up, once

- `npm ci`, and Docker running (`docker info`). No browser install: the image has it.
- `ffmpeg` on `PATH`: `brew install ffmpeg` / `sudo apt-get install -y ffmpeg`. It makes the `.mp4` and the GIF.
  Without it, `record.ts` keeps the raw `demo.webm`, makes no GIF and exits 1.

## 2. Write the scenario

Read `spec/web-view.md` and the change. Show the feature, nothing else; aim for 10–30 s: the GIF grows by
about 1 MB per 10 s. Write `docs/demo/<feature>/scenario.ts`; edit it if it exists:

```ts
import type { Demo } from '../../../tests/demo.ts';

export default async ({ page, click, type, point, pause, snapshot }: Demo) => {
  await pause(800);
  await type(page.getByLabel('GitHub repository URL'), 'https://github.com/JetBrains/fixture');
  await click(page.getByRole('button', { name: 'Scan' }));
  await page.locator('.result, .error').first().waitFor();
  await point(page.locator('.skills li').first()); // the feature being shown
  await snapshot('result');
  await pause(2500);
};
```

- Use `click`, `type` and `point`: they move the visible cursor. Plain `page.click` jumps.
- `pause` after each change, so the viewer can read it. Wait for elements, never for fixed network time.
  The tests skip `pause` and the cursor's travel, so the scenario MUST NOT depend on them.
- `snapshot('<name>')` at each key point: before the change, and each state the feature produces.
  The cursor dot is not in it.
- Only repositories from `tests/helpers.ts`; a missing one → add its recording there.
- `npm run typecheck` covers `docs/`; it MUST pass.

## 3. Record

```sh
node .claude/skills/demo-video/record.ts <feature>
```

- `--size 1280x720` (default).
- Then `npm test`: the new demo MUST pass.

## 4. Check and hand over

- Read each `<name>.png`: it MUST show the state named.
- Check the video: `ffprobe -v error -show_entries format=duration -of csv=p=0 docs/demo/<feature>/demo.mp4`
  for the length; `ffmpeg -ss 5 -i docs/demo/<feature>/demo.mp4 -frames:v 1 $TMPDIR/frame.png` and read the
  frame to see it shows the feature. Frames MUST NOT go into the folder.
- Check the GIF: `ls -l docs/demo/<feature>/demo.gif`. Over 5 MB → shorten the scenario and re-record.
- A demo test fails → the actual screenshot is in `test-results/demo/<feature>/`. Intended change → re-record.
- Commit the folder with the change. For a PR, embed `demo.gif` in the description as an image and link
  `demo.mp4`; the `issue-to-pr` skill has the URLs.
