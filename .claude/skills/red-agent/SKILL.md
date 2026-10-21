---
name: red-agent
description: Hunt for a bug in Skill Atlas the way a hostile user would — run the app, drive it, read the code — and prove it with steps to reproduce and a recorded demo. Reports to the person in the chat, or files a GitHub issue when run as an automation. Use when asked to find bugs, break the app or test it like a user.
---

# Red agent

Find a bug a user would hit, prove it, show it. Do not fix it: the report is the result.

A bug is a behaviour a user can see, in a scenario a user would run, that is wrong beyond argument:
it contradicts `spec/`, or the app contradicts itself (the CLI and the web view; `GITHUB_TOKEN` set
and not; what GitHub shows and what the scan says), or a crash, a dead link, a wrong count, lost data.
Not a bug: a style nit, a missing feature, a gap in the spec, a slow but correct answer.

## Who reads the result

- **A person, in the chat** asked → report in the chat (*6. Report*). Suspicions MAY go there too, marked as such.
- **An automation** (nobody reads the chat: Air cloud sets `AIR_STARTUP_MODE=task` and no person asked)
  → one GitHub issue per confirmed bug, with the demo. No issue for a suspicion.

## 1. Know the app

- Read `spec/` and `README.md`: what is promised. `AGENTS.md` has the commands.
- The scenarios: `./skill-atlas scan <directory>`; `./skill-atlas scan <GitHub URL>` with and without
  `GITHUB_TOKEN` (two code paths: code search and the tree); the web view, `npm run web`, and its filter.
- `tests/` show what is already checked. A bug lives where they do not look.

## 2. Hunt

Go where the code meets the world and try what the tests do not:

- **Inputs.** URLs with `www.`, `.git`, a trailing slash, a branch path, uppercase; a renamed, empty or
  private repository; directories with symlinks, nested skills, a `SKILL.md` at the root, unreadable files.
- **Files.** Front matter with CRLF, a BOM, folded strings, numbers, quotes, lists, duplicate keys; a name
  with spaces or Unicode; a description with no period, with `e.g.`, with Markdown or HTML; an empty file.
- **GitHub.** Forks, a truncated tree, more than 100 results, a default branch with a slash, a rate
  limit, a file listed but gone, a redirect.
- **The page.** Filter words with punctuation, case and Unicode; marks in names; the count; dark mode;
  back navigation; the field after an error.
- **The seams.** Each promise in `spec/` that two paths must keep alike: CLI and page, token and no
  token, the first sentence, the sort order, the copies, the links.

Run the real thing, not a mental model:

- A crafted repository: `mkdir -p $TMPDIR/repo/.claude/skills/x`, write its `SKILL.md`, `./skill-atlas scan $TMPDIR/repo`.
- Live GitHub: `GITHUB_TOKEN=$(gh auth token) ./skill-atlas scan <URL>`, then the same without the token.
  `gh api <path>` shows what GitHub answers. Public repositories only; mind the rate limit.
- The web view: `node src/web.ts 3000 &`, then `curl -s 'http://127.0.0.1:3000/?repo=<URL>'`; the page
  in a browser through a scenario (*5. Demo*).
- Read the code of the path you suspect, `src/`, for the why and for its neighbours. Reading suggests;
  only running confirms.

Keep a list of suspicions as you go. Time-box: an hour without a confirmed bug → report the suspicions
and what was covered, and stop. Leave the working tree as you found it: `git status` MUST show no change of yours.

## 3. Confirm

A bug is confirmed when all of these hold:

- Reproduced twice, from a clean state, with the exact steps written down.
- The expected behaviour is written down with its source: the `spec/` line, or the counterpart that disagrees.
- The steps use only what a user has: the CLI, the page, a repository. No test helpers, no code changes.
- No open issue for it: `gh issue list -R SergeevPavel/ai-workshop-start --state open --search "<words>"`.

Otherwise it is a suspicion. In the chat, say so and say what you saw; as an automation, file nothing.

## 4. Steps to reproduce

```
## <one line: what goes wrong, in the user's words>
Commit <git rev-parse --short HEAD>. Found by the red-agent skill.
### Steps
1. <command or click, with the exact input>
### Expected
<what, and why: the spec line or the counterpart>
### Actual
<the exact output, in a code block>
### Cause
<file:line and a sentence, if found; else omit the section>
### Demo
<the files, see 5>
```

## 5. Demo

The demo shows the steps, not the code. Never in `docs/demo`: a golden there makes the bug the acceptance test.

- **The web view shows it** → write `test-results/red-agent/<slug>/scenario.ts` as the `demo-video`
  skill writes one (`import type { Demo } from '../../../tests/demo.ts'`; `click`, `type`, `point`,
  `pause`; `snapshot` at each state that matters), then:
  ```sh
  node .claude/skills/red-agent/record.ts <slug> [--live]
  ```
  `<slug>` is kebab-case and names the bug, e.g. `fork-scan-zero-skills`. The folder gets `demo.mp4`,
  `demo.gif` and a `<name>.png` per snapshot. The page answers from `tests/helpers.ts` by default;
  `--live` opens GitHub itself with `GITHUB_TOKEN`, as `src/web.ts` does, for a bug that needs a real
  repository. Docker and `ffmpeg` as for `demo-video`. With `AIR_ARTIFACTS_DIR` set, the folder is
  copied there as `red-agent/<slug>`.
  Read each PNG and a frame of the video as `demo-video` says: they MUST show the wrong state.
- **Only the CLI shows it** → `test-results/red-agent/<slug>/transcript.md`: each command and its
  verbatim output in a code block, the wrong line pointed out.

## 6. Report

- **In the chat**: the steps (*4*), the demo files, then the suspicions and what was covered without a finding.
- **As an automation**:
  ```sh
  node .claude/skills/red-agent/publish.ts <slug>
  ```
  pushes the folder to the `red-agent-demos` branch of `origin`, nothing else, and prints a URL per file. Then
  ```sh
  gh issue create -R SergeevPavel/ai-workshop-start --label bug --title "<the one line>" --body "<the steps>"
  ```
  with, under *Demo*, `![Demo](<GIF URL>)`, then the links to the video, the PNGs and the scenario or
  transcript. Issues go to the fork: `upstream` has issues off. Print the issue URL.
- Never in a report: a token, a path outside the repository, a test helper.
