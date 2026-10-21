# Web view
`npm run web` (or `node src/web.ts [port]`) serves the page at `http://127.0.0.1:3000/`.
Prints the result **at once**; *nothing is stored*. `GITHUB_TOKEN`, optional: as for the CLI.
## Page
- A text field for a **GitHub repository URL** and a *Scan* button; the form submits `GET /?repo=<URL>`
- The result, *the same shape as the CLI*: `owner/repo · N skills`, then each skill's
  **name** — the description's *first sentence*, its **link** (pinning the scanned commit),
  `also in <paths>` for copies; sorted by **name**
- Warnings appear under the list; a *thin client*, the core does the work
## Filter
- Above the list, a **Filter** field; typing filters the list **live**, in the page: the repository
  is fetched *once*, by the scan, never again for the filter
- A skill stays when *each word* of the text appears in its shown **name** or **description**,
  ignoring case; every occurrence is **highlighted**; the heading reads `owner/repo · M of N skills`
- Nothing matches → `No skill matches.`; the warnings stay under the list either way
- An empty field shows the whole list again, `N skills`, nothing highlighted
## Clusters
- Beside the Filter field, a **Cluster similar skills** checkbox, *off*: the list, by name. Checked → the skills
  regroup **live**, in the page, under a heading per cluster, `<word> · N skills` (`analysis.md § Clusters`), then
  `on their own · N skills` for the rest; unchecked → the list by name again
- The clusters come with the scan, computed *once* by the core and carried in the page: the checkbox
  never recomputes nor fetches; the headings read as the CLI prints them
- With the filter: a skill hidden by the filter stays hidden in its cluster; a cluster with no shown skill is
  hidden, heading and all; `M of N skills` and `No skill matches.` as without clusters
## Look
- One **centered column** on a *tinted* page; the field and the *Scan* button are **one bar**, the button in
  the one **accent** colour, which also marks the focus and the heading's **count**, a *badge*
- Each skill is a **card**: the name as a *monospace chip*, the description beside it, the link and
  `also in` *muted* under them; the highlights are *amber*
- A cluster heading is *muted*, its count the same *badge*; the checkbox sits at the end of the filter bar
- The error and the warnings are **callouts**, *red* and *amber*; `No skill matches.` is a *dashed* card
- **Light and dark** follow the system
- The page is **self-contained**: its stylesheet is *inline*; no external stylesheet, web font or image
- The goldens of the demos in `docs/demo` are the acceptance test for the look; `web-view-look` shows it
  light, dark and with the error
## Details
- Server-rendered HTML; the only client script is `/filter.js`, the filter and the cluster checkbox, which
  touches nothing but the list; local directories are *not* served
- Unreachable repository, or not a GitHub URL → a clear message in the page, status **400**
- Everything from the user or GitHub is HTML-escaped
