---
name: code-review
description: Review a change to Skill Atlas against its spec, tests and conventions and give it a green or red light. Use before a commit or PR, or when asked to review a diff, branch or PR.
---

# Code review

Review the change, not the repository. Report findings; do not edit code unless asked.

## 1. Find the change

- No target: `git diff main...HEAD` plus uncommitted changes (`git diff HEAD`).
- A branch: `git diff main...<branch>`. A PR number: `gh pr diff <n>`.
- Read every changed file in full, and the code it calls. A diff alone hides context.

## 2. Read the spec

`spec/` is the source of truth for behaviour. Read it first.

## 3. Check

**Critical.** Any one of these is a red light:

- Behaviour contradicts `spec/`, or behaviour changed without the matching `spec/` change.
- A spec case without an integration test (`AGENTS.md`).
- A test that hits the network instead of `atlas()` / the server and the recordings in `tests/helpers.ts`, or one that replicates the implementation.
- `npm test` or `npm run typecheck` fails.
- A defect you can trigger with a concrete input.

**Minor.** Reported, never a red light on its own:

- Single-use helper functions outside a logical unit; constants hoisted without a second user.
- Comments that narrate, run long, or state obligations without RFC 2119 keywords.
- Naming, wording, dead code.

## 4. Report

The verdict comes first, on its own line:

- 🔴 **Red light**: at least one critical finding. Merge not recommended.
- 🟢 **Green light**: no critical finding. Minor ones MAY remain.

Then every finding as a comment, critical first:

```
<file>:<line> — <one-sentence defect>
  Scenario: <input or state> → <wrong output or crash>
  Fix: <short suggestion>
```

Then the checks run and their result. Say "No findings" if there are none.
Only report what you verified. Mark a finding *uncertain* if you could not confirm it; an uncertain finding MUST NOT turn the light red.
