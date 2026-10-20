---
name: demo-video
description: Record a short video demo of a web view feature, on macOS or Linux, with a GIF of it for the pull request. Use when asked for a demo, screencast, video or GIF of the web page, e.g. for a pull request.
---

# Demo video

`record.ts` starts the web view, opens the page in a headless Chromium, runs a scenario and saves the video,
with a GIF of it. The scenario does every interaction, the repository URL included.
Headless: no display, no screen-recording permission. The same on macOS, Linux and CI.

Each feature has its own folder, committed with the change:

```
docs/demo/<feature>/
  scenario.ts   what the video shows
  demo.mp4      the recording
  demo.gif      the same at 10 fps, 960 px wide: for the pull request, where GitHub shows a GIF inline but a video only as a link
```

`<feature>` is kebab-case and names the feature, e.g. `copies-list`. Re-recording replaces both files.

## 1. Set up, once

- `npm ci`, then `npx playwright install chromium`.
- Linux: `npx playwright install --with-deps chromium` instead; it installs the system libraries (needs sudo).
- `ffmpeg` on `PATH`: `brew install ffmpeg` / `sudo apt-get install -y ffmpeg`. It makes the `.mp4` and the GIF.
  Without it, `record.ts` keeps the raw `demo.webm`, makes no GIF and exits 1.

## 2. Write the scenario

Read `spec/web-view.md` and the change. Show the feature, nothing else; aim for 10–30 s: the GIF grows by
about 1 MB per 10 s. Write `docs/demo/<feature>/scenario.ts`; edit it if it exists:

```ts
import type { Demo } from '../../../.claude/skills/demo-video/record.ts';

export default async ({ page, click, type, point, pause }: Demo) => {
  await pause(800);
  await type(page.getByLabel('GitHub repository URL'), 'https://github.com/JetBrains/fixture');
  await click(page.getByRole('button', { name: 'Scan' }));
  await page.locator('.result, .error').first().waitFor();
  await point(page.locator('.skills li').first()); // the feature being shown
  await pause(2500);
};
```

- Use `click`, `type` and `point`: they move the visible cursor. Plain `page.click` jumps.
- `pause` after each change, so the viewer can read it. Wait for elements, never for fixed network time.
- `npm run typecheck` covers `docs/`; it MUST pass.

## 3. Record

```sh
node .claude/skills/demo-video/record.ts <feature> --recorded
```

- `--recorded`: GitHub answers from `tests/helpers.ts` (`https://github.com/JetBrains/fixture`, `…/example`).
  Offline and repeatable. Prefer it unless the feature needs a real repository.
- Without it: real GitHub, for any repository the scenario types; `GITHUB_TOKEN` as for the CLI.
- `--size 1280x720` (default).

## 4. Check and hand over

- Check the video: `ffprobe -v error -show_entries format=duration -of csv=p=0 docs/demo/<feature>/demo.mp4`
  for the length; `ffmpeg -ss 5 -i docs/demo/<feature>/demo.mp4 -frames:v 1 $TMPDIR/frame.png` and read the
  frame to see it shows the feature. Frames MUST NOT go into the folder.
- Check the GIF: `ls -l docs/demo/<feature>/demo.gif`. Over 5 MB → shorten the scenario and re-record.
- Commit the folder with the change. For a PR, embed `demo.gif` in the description as an image and link
  `demo.mp4`; the `issue-to-pr` skill has the URLs.
