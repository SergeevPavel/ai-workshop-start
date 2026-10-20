# Skill Atlas

Every agent skill in a repository: `./skill-atlas scan` finds each `SKILL.md` and prints its name,
description and link. An organization URL, `https://github.com/JetBrains`, scans every repository:
the skills grouped by repository, a copy in another repository named `owner/repo:path`.

```console
$ npm ci
$ ./skill-atlas scan https://github.com/JetBrains/kotlin
JetBrains/kotlin · 6 skills
…
build-tools-bump-gradle-api — Bumps the Gradle API version that Kotlin Gradle plugins are compiled against in the Kotlin compiler repository.
  https://github.com/JetBrains/kotlin/blob/5ab6270ab772d113e8ad52ebfcaa0109c522ae00/.claude/skills/build-tools-bump-gradle-api/SKILL.md
…
```

The same in a browser: `npm run web`, then open <http://127.0.0.1:3000/> and paste a repository URL.

Set `GITHUB_TOKEN` for a higher GitHub rate limit. `npm test` runs the tests.

- [spec/](spec/): what it does. [AGENTS.md](AGENTS.md): the definition of done.
- [fixture/](fixture/README.md): a small repository for the tests.
