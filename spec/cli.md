# Command line
`./skill-atlas scan [--cluster] <GitHub URL | directory>`
Prints the result **at once**; *nothing is stored*.
`GITHUB_TOKEN`, optional: a higher GitHub rate limit.
## Output
```
JetBrains/kotlin · 6 skills
build-tools-bump-gradle-api — Bumps the Gradle API…
  https://github.com/JetBrains/kotlin/blob/<commit>/…
```
- Sorted by **name**; the description's *first sentence*
- `also in <paths>` for copies; warnings go to *stderr*
## Clusters
`--cluster`, before or after the URL: the skills in **clusters** (`analysis.md § Clusters`), a *blank line* and
`<word> · N skills` before each, `on their own · N skills` before the rest, when there are any; each skill as above
```
JetBrains/kotlin · 6 skills

gradle · 3 skills
build-tools-bump-gradle-api — Bumps the Gradle API…
  https://github.com/JetBrains/kotlin/blob/<commit>/…
…

on their own · 1 skill
…
```
