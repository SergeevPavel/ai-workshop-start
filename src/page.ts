// The web page: a field for a GitHub repository URL and, once scanned, the skills in the same
// shape as the CLI prints them. Server-rendered; the only script is the live filter, which hides
// list items and marks the matches in the page. Everything is escaped.
import { firstSentence, skillLink, type Repository, type Skill } from './core/model.ts';
import type { ScanResult } from './core/scan.ts';

export type PageModel = {
  /** What the field holds. */
  repo: string;
  result?: ScanResult;
  error?: string;
};

export function page({ repo, result, error }: PageModel): string {
  const title = result ? `${result.repository.id} · Skill Atlas` : 'Skill Atlas';
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escape(title)}</title>
<style>${STYLE}</style>
</head>
<body>
<main>
<h1>Skill Atlas</h1>
<p>Every <code>SKILL.md</code> in a GitHub repository: its name, description and link.</p>
<form method="get" action="/">
<label for="repo">GitHub repository URL</label>
<input id="repo" name="repo" type="text" value="${escape(repo)}" placeholder="https://github.com/JetBrains/kotlin" required autofocus>
<button type="submit">Scan</button>
</form>
${error ? `<p class="error" role="alert">${escape(error)}</p>` : ''}
${result ? FILTER_FIELD : ''}
${result ? section(result) : ''}
</main>
${result ? '<script type="module" src="/filter.js"></script>' : ''}
</body>
</html>
`;
}

/** The filter field, above the result; the script in /filter.js does the filtering, live. */
const FILTER_FIELD = `<p class="filter">
<label for="filter">Filter skills</label>
<input id="filter" type="search" placeholder="words of the name or description, e.g. commit" autocomplete="off">
</p>`;

/**
 * `owner/repo · N skills`, each skill as the CLI prints it, then the warnings. The count, the
 * hidden `No skill matches.` and the marks in each name and description are the filter script's.
 */
function section({ repository, skills, warnings }: ScanResult): string {
  const count = `${skills.length} ${skills.length === 1 ? 'skill' : 'skills'}`;
  const lines = [
    '<section class="result">',
    `<h2 class="repository">${escape(repository.id)} · <span class="count">${count}</span></h2>`,
    '<ul class="skills">',
    ...skills.flatMap((skill) => item(repository, skill)),
    '</ul>',
    '<p class="empty" hidden>No skill matches.</p>',
  ];
  if (warnings.length > 0) {
    lines.push('<ul class="warnings">', ...warnings.map((warning) => `<li>warning: ${escape(warning)}</li>`), '</ul>');
  }
  lines.push('</section>');
  return lines.join('\n');
}

function item(repository: Repository, skill: Skill): string[] {
  const link = skillLink(repository, skill);
  const lines = ['<li>'];
  const name = `<span class="name">${escape(skill.name)}</span>`;
  lines.push(skill.description ? `${name} — <span class="description">${escape(firstSentence(skill.description))}</span>` : name);
  lines.push(`<a class="link" href="${escape(link)}">${escape(link)}</a>`);
  if (skill.copies.length > 0) lines.push(`<span class="copies">also in ${escape(skill.copies.join(', '))}</span>`);
  lines.push('</li>');
  return lines;
}

function escape(text: string): string {
  return text.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string);
}

// spec/web-view.md § Look: one accent, light and dark from the system; self-contained, with no
// external stylesheet, web font or image. The structure the filter script relies on is untouched.
const STYLE = `
:root {
  color-scheme: light dark;
  --bg: #f3f5fa; --surface: #fff; --text: #1b2130; --muted: #5f6b80; --border: #d9dfeb;
  --accent: #3556d6; --accent-hover: #2b47b8; --on-accent: #fff; --ring: #bcc8f2;
  --mark: #ffe58a; --error: #b42318; --error-bg: #fff2f0; --warning: #7a4d00; --warning-bg: #fff6dc;
  --shadow: 0 1px 0 #e3e8f1;
  --mono: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
}
@media (prefers-color-scheme: dark) {
  :root {
    --bg: #0f1320; --surface: #181d2c; --text: #e6e9f2; --muted: #9aa5bb; --border: #2b3347;
    --accent: #8ca0ff; --accent-hover: #a3b3ff; --on-accent: #0f1320; --ring: #3b4a85;
    --mark: #6a5300; --error: #ff8a80; --error-bg: #2b171a; --warning: #ffd166; --warning-bg: #2a2412;
    --shadow: none;
  }
}
* { box-sizing: border-box; }
body { margin: 0; background: var(--bg); color: var(--text); font: 16px/1.5 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; }
main { max-width: 52rem; margin: 0 auto; padding: 3rem 1.25rem 4rem; }
h1 { margin: 0; font-size: 2rem; font-weight: 700; letter-spacing: -.02em; }
h1 + p { margin: .25rem 0 0; color: var(--muted); }
code { font-family: var(--mono); font-size: .9em; padding: .1em .35em; background: var(--surface); border: 1px solid var(--border); border-radius: .3rem; }
form { display: grid; grid-template-columns: 1fr auto; gap: .375rem 0; margin: 2rem 0 0; }
label { font-size: .875rem; font-weight: 600; color: var(--muted); }
form label { grid-column: 1 / -1; }
input { font: inherit; color: inherit; background: var(--surface); border: 1px solid var(--border); border-radius: .5rem; padding: .625rem .875rem; min-width: 0; box-shadow: var(--shadow); }
input::placeholder { color: var(--muted); }
input:focus-visible { outline: 2px solid transparent; border-color: var(--accent); box-shadow: 0 0 0 3px var(--ring); }
button:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
form input { border-radius: .5rem 0 0 .5rem; }
form input:focus-visible { position: relative; z-index: 1; }
button { font: inherit; font-weight: 600; width: 6.5rem; padding: calc(.625rem + 1px) 0; margin-left: -1px; border: 0; border-radius: 0 .5rem .5rem 0; background: var(--accent); color: var(--on-accent); cursor: pointer; }
button:hover { background: var(--accent-hover); }
.error { margin: 1.5rem 0 0; padding: .75rem 1rem; color: var(--error); background: var(--error-bg); border-left: 3px solid var(--error); border-radius: 0 .5rem .5rem 0; font-weight: 500; overflow-wrap: anywhere; }
.filter { display: grid; gap: .375rem; margin: 1.5rem 0 0; }
.result { margin-top: 2rem; }
.repository { margin: 0 0 1rem; font-size: 1.125rem; font-weight: 600; }
.count { display: inline-block; vertical-align: .1em; padding: .05rem .65rem; font-size: .8125rem; color: var(--accent); background: color-mix(in srgb, var(--accent) 12%, var(--bg)); border-radius: 999px; }
.skills, .warnings { list-style: none; padding: 0; margin: 0; display: grid; gap: .75rem; }
.skills li { padding: 1rem 1.25rem; background: var(--surface); border: 1px solid var(--border); border-radius: .75rem; box-shadow: var(--shadow); }
.name { padding: .1em .45em; font: 600 .875rem/1.4 var(--mono); color: var(--accent); background: color-mix(in srgb, var(--accent) 10%, var(--surface)); border-radius: .35rem; }
.link, .copies { display: block; margin-top: .5rem; font-size: .8125rem; color: var(--muted); overflow-wrap: anywhere; }
.link { font-family: var(--mono); text-decoration: none; }
.link:hover { color: var(--accent); text-decoration: underline; }
mark { padding: 0 .1em; background: var(--mark); color: inherit; border-radius: 3px; }
.empty { margin: 0; padding: 2rem 1rem; text-align: center; color: var(--muted); border: 1px dashed var(--border); border-radius: .75rem; }
.warnings { margin-top: 1rem; gap: .5rem; }
.warnings li { padding: .625rem .875rem; font-size: .875rem; color: var(--warning); background: var(--warning-bg); border-left: 3px solid var(--warning); border-radius: 0 .5rem .5rem 0; overflow-wrap: anywhere; }
`;
