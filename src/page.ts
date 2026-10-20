// The web page: a field for a GitHub repository or organization URL and, once scanned, the skills
// in the same shape as the CLI prints them. Server-rendered, no client script; everything is escaped.
import { count, firstSentence, skillLink, type Repository, type Skill } from './core/model.ts';
import type { OrganizationScanResult, ScanResult } from './core/scan.ts';

export type PageModel = {
  /** What the field holds. */
  repo: string;
  result?: ScanResult | OrganizationScanResult;
  error?: string;
};

export function page({ repo, result, error }: PageModel): string {
  const scanned = result && ('organization' in result ? result.organization : result.repository.id);
  const title = scanned ? `${scanned} · Skill Atlas` : 'Skill Atlas';
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
<p>Every <code>SKILL.md</code> in a GitHub repository, or an organization: its name, description and link.</p>
<form method="get" action="/">
<label for="repo">GitHub repository or organization URL</label>
<input id="repo" name="repo" type="text" value="${escape(repo)}" placeholder="https://github.com/JetBrains/kotlin" required autofocus>
<button type="submit">Scan</button>
</form>
${error ? `<p class="error" role="alert">${escape(error)}</p>` : ''}
${result ? section(result) : ''}
</main>
</body>
</html>
`;
}

/**
 * `owner/repo · N skills` and each skill as the CLI prints it; an organization: its heading,
 * then each repository's. The warnings come last.
 */
function section(result: ScanResult | OrganizationScanResult): string {
  const lines = ['<section class="result">'];
  if ('organization' in result) {
    const skills = result.repositories.reduce((sum, { skills }) => sum + skills.length, 0);
    const heading = `${result.organization} · ${count(skills, 'skill')} in ${count(result.repositories.length, 'repository', 'repositories')}`;
    lines.push(`<h2 class="organization">${escape(heading)}</h2>`);
    for (const { repository, skills } of result.repositories) lines.push(...list(repository, skills, 'h3'));
  } else {
    lines.push(...list(result.repository, result.skills, 'h2'));
  }
  if (result.warnings.length > 0) {
    lines.push('<ul class="warnings">', ...result.warnings.map((warning) => `<li>warning: ${escape(warning)}</li>`), '</ul>');
  }
  lines.push('</section>');
  return lines.join('\n');
}

function list(repository: Repository, skills: Skill[], heading: 'h2' | 'h3'): string[] {
  return [
    `<${heading} class="repository">${escape(repository.id)} · ${count(skills.length, 'skill')}</${heading}>`,
    '<ul class="skills">',
    ...skills.flatMap((skill) => item(repository, skill)),
    '</ul>',
  ];
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
.organization { font-size: 1.2rem; }
.repository { font-size: 1.1rem; }
.skills, .warnings { list-style: none; padding: 0; }
.skills li { padding: .5rem 0; border-top: 1px solid color-mix(in srgb, currentColor 20%, transparent); }
.name { font-weight: 600; }
.link, .copies { display: block; padding-left: 1.5rem; font-size: .9rem; overflow-wrap: anywhere; }
.warnings li { color: #8a6d00; font-size: .9rem; }
`;
