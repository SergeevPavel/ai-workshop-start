# Repository analysis
## Input
A **GitHub repository** URL, or a local directory
## Output
Every `SKILL.md` in an *agent's skills folder*: **name**, **description**, **link**
## Architecture
Core: fetch → find → parse. CLI: a *thin client*.
Skill: id = `repo:path`, name, description, commit
## Details
- **GitHub API**, no clone; *under 5 s* for intellij-community
- Agent folders: `.agents/skills`, `.claude/skills`, `.github/skills`, `.agent/skills`
- A folder counts *at any depth*: `modules/x/.claude/skills/y/SKILL.md`
- A `SKILL.md` outside them is *not a skill*
- The name: front matter, else the directory
- The link pins the *scanned commit*
- Identical `SKILL.md` content → *one skill*: the first path links, the others are its **copies**
- Malformed front matter → a *warning*, the scan goes on
- Unreachable repository → a clear message, exit code 1
