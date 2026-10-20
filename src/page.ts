// The web page: a field for a GitHub repository URL and, once scanned, the skills in the same
// shape as the CLI prints them. Server-rendered; the only script is the live filter, which hides
// list items in the page. Everything is escaped.
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
<input id="filter" type="search" placeholder="fuzzy: cmt finds commits" autocomplete="off">
</p>`;

/**
 * `owner/repo · N skills`, each skill as the CLI prints it, then the warnings. The count and the
 * hidden `No skill matches.` are the filter script's to update.
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
  const lines = [`<li class="skill" data-name="${escape(skill.name)}" data-description="${escape(skill.description)}">`];
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

const STYLE = `
:root { color-scheme: light dark; }
body { margin: 0; font: 16px/1.5 system-ui, sans-serif; }
main { max-width: 56rem; margin: 0 auto; padding: 2rem 1rem; }
h1 { margin: 0 0 .25rem; }
form { display: grid; grid-template-columns: 1fr auto; gap: .5rem 1rem; align-items: center; margin: 1.5rem 0; }
label { grid-column: 1 / -1; font-weight: 600; }
input { font: inherit; padding: .5rem .75rem; min-width: 0; }
button { font: inherit; padding: .5rem 1.25rem; cursor: pointer; }
.error { color: #b3261e; font-weight: 600; }
.filter { display: grid; gap: .5rem; margin: 1.5rem 0 0; }
.empty { opacity: .7; }
.repository { font-size: 1.1rem; }
.skills, .warnings { list-style: none; padding: 0; }
.skills li { padding: .5rem 0; border-top: 1px solid color-mix(in srgb, currentColor 20%, transparent); }
.name { font-weight: 600; }
.link, .copies { display: block; padding-left: 1.5rem; font-size: .9rem; overflow-wrap: anywhere; }
.warnings li { color: #8a6d00; font-size: .9rem; }
`;
