# Command line
`./skill-atlas scan <GitHub URL | directory>`
Prints the result **at once**; *nothing is stored*.
`GITHUB_TOKEN`, optional: a higher GitHub rate limit.
## Output
```
JetBrains/kotlin · 6 skills
build-tools-bump-gradle-api — Bumps the Gradle API…
  https://github.com/JetBrains/kotlin/blob/<commit>/…
```
- Sorted by **name**; the description's *first sentence*
- `also in <paths>` for copies; a copy in another repository is `owner/repo:path`
- Warnings go to *stderr*; in an organization, prefixed `owner/repo: `
## An organization
`<owner> · N skills in M repositories`, then each repository as above, a *blank line* before each
```
JetBrains · 7 skills in 2 repositories

JetBrains/intellij-community · 1 skill
…

JetBrains/kotlin · 6 skills
…
```
