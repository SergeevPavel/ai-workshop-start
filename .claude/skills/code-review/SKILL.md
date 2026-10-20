---
name: code-review
description: Review a change to Skill Atlas against its spec, tests and conventions. Use before a commit or a pull request, or when asked to review a diff, branch or PR.
---

# Code review

Review the change, not the whole repository. Report findings; do not edit code unless asked.

## 1. Find the change

- No target: `git diff main...HEAD` plus uncommitted changes (`git diff HEAD`).
- A branch: `git diff main...<branch>`. A PR number: `gh pr diff <n>`.
- Read every changed file in full, and the code it calls. A diff alone hides context.

## 2. Read the spec

Read `spec/` first. It is the source of truth for behaviour.

## 3. Check

**Spec and tests**
- Behaviour changed → `spec/` MUST change in the same diff.
- Every spec case MUST have an integration test (`AGENTS.md`). List cases without one.
- Tests go through `atlas()` / the server and the recordings in `tests/helpers.ts`. They MUST NOT hit the network.
- Tests MUST NOT replicate the implementation. Unit tests only for non-trivial contracts or logic.

**Style**
- No single-use helper functions unless the block is a logical unit.
- Constants stay local unless shared.
- Comments: short, only where code needs clarification, RFC 2119 keywords for obligations. No narration.

## 5. Report

Most severe first. For each finding:

```
<file>:<line> — <one-sentence defect>
  Scenario: <input or state> → <wrong output or crash>
  Fix: <short suggestion>
```

Then: checks run and their result; spec cases still without a test. Say "No findings" if there are none.
Only report what you verified. Mark a finding *uncertain* if you could not confirm it.
