# Repository analysis
## Input
A **GitHub repository** URL, a **GitHub organization** URL (`https://github.com/<owner>`; a user's works the same), or a local directory
## Output
Every `SKILL.md`: **name**, **description**, **link**
## Architecture
Core: fetch → find → parse. CLI: a *thin client*.
Skill: id = `repo:path`, name, description, commit
## Details
- **GitHub API**, no clone; *under 5 s* for intellij-community
- The name: front matter, else the directory
- The link pins the *scanned commit*
- Identical `SKILL.md` content → *one skill*: the first path links, the others are its **copies**
- Malformed front matter → a *warning*, the scan goes on
- Unreachable repository → a clear message, exit code 1
## Organization
- *Every* repository, **grouped by repository**: each as a repository scan, sorted by `owner/repo`; repositories *without skills* are left out
- Identical `SKILL.md` content in *several repositories* → the skill stays in **each** repository's list; the others are its copies, named `owner/repo:path`
- `GITHUB_TOKEN`: *one* code search for the whole organization; without it, the repository list, then every repository's tree
- A repository that cannot be scanned (empty, blocked) → a *warning*, `owner/repo: …; skipped`, the scan goes on. GitHub unreachable, rate-limited or rejecting the token → the scan *stops*
- Unknown organization → a clear message, exit code 1
