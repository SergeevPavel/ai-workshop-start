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
## Details
- Server-rendered HTML; the only client script is the filter, `/filter.js`, which touches nothing
  but the list; local directories are *not* served
- Unreachable repository, or not a GitHub URL → a clear message in the page, status **400**
- Everything from the user or GitHub is HTML-escaped
