# Repository analysis
## Input
A **GitHub repository** URL, or a local directory
## Output
Every `SKILL.md`: **name**, **description**, **link**
## Architecture
Core: fetch → find → parse; cluster on request. CLI: a *thin client*.
Skill: id = `repo:path`, name, description, commit
## Details
- **GitHub API**, no clone; *under 5 s* for intellij-community
- The name: front matter, else the directory
- The link pins the *scanned commit*
- Identical `SKILL.md` content → *one skill*: the first path links, the others are its **copies**
- Malformed front matter → a *warning*, the scan goes on
- Unreachable repository → a clear message, exit code 1
## Clusters
Similar skills, grouped: `--cluster` in the CLI, a checkbox in the web view.
- Two skills are **similar** when they share a *word* of the name or description: lower-cased letters and digits;
  words under three letters and *stop words* (`the`, `and`, `use`, `before`…) dropped; a trailing `s`, `ed` or
  `ing` dropped when three letters remain, `es` after `x`, `z`, `ch`, `sh` or `ss`, `ies` → `y`; a doubled
  consonant before `ed` or `ing` folded, except `l`, `s`, `z`: `commit`, `commits` and `committing` are one word,
  `patch` and `patches`, `tag` and `tagged`, `repository` and `repositories` too
- A **cluster** is the skills sharing the word *most* of them share, at least **two** (ties: the first word
  alphabetically), **named** after that word's *shortest form* among them; then the next cluster among the rest,
  until no two share a word. The skills left are *on their own*
- Clusters sorted by **size**, largest first, then by name; skills by **name** within
- The algorithm is **pluggable**: a `Clusterer` in the core, the word heuristic by default; a model later.
  A skill's repository plays no part: clusters cross **repositories**
- Computed *once* per scan, by the core; a view MUST NOT recompute what it was given
