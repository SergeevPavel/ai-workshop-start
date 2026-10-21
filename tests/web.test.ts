// The decisions in spec/web-view.md, checked over HTTP on the real server, with GitHub answering
// from tests/helpers.ts.
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { after, before, test } from 'node:test';
import { install } from '../src/client/filter.js';
import { openGitHub } from '../src/core/github.ts';
import { startWeb } from '../src/server.ts';
import { atlas, EXAMPLE_COMMIT, github } from './helpers.ts';

const WEB = fileURLToPath(new URL('../src/web.ts', import.meta.url));
const FILTER_SCRIPT = fileURLToPath(new URL('../src/client/filter.js', import.meta.url));

let web: Awaited<ReturnType<typeof startWeb>>;
// As src/web.ts opens repositories: GitHub only, here through code search, with a token.
before(async () => (web = await startWeb({ open: (input) => openGitHub(input, { fetch: github, token: 'test' }) })));
after(() => web.close());

async function get(path: string) {
  const response = await fetch(new URL(path, web.url));
  return { status: response.status, type: response.headers.get('content-type'), html: await response.text() };
}

/** The text of the result section, one line per CLI line: hidden and tags dropped, entities decoded. */
function resultText(html: string): string[] {
  const section = /<section class="result">([\s\S]*?)<\/section>/.exec(html);
  assert.ok(section, 'the page has a result section');
  return section[1]
    .split('\n')
    .filter((line) => !/^<[a-z]+[^>]* hidden>/.test(line))
    .map((line) => decode(line.replace(/<[^>]*>/g, '')).trim())
    .filter(Boolean);
}

function decode(text: string): string {
  return text.replace(/&(amp|lt|gt|quot|#39);/g, (_, name) => ({ amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'" })[name as string] as string);
}

test('GET /: the page with an empty field for the repository URL and no result', async () => {
  const home = await get('/');
  assert.equal(home.status, 200);
  assert.equal(home.type, 'text/html; charset=utf-8');
  assert.match(home.html, /<form method="get" action="\/">/);
  assert.match(home.html, /<input id="repo" name="repo" type="text" value=""/);
  assert.match(home.html, /<button type="submit">Scan<\/button>/);
  assert.doesNotMatch(home.html, /class="result"|class="error"/);
});

test('?repo=<URL>: the repository, then each skill with its first sentence and pinned link', async () => {
  const scanned = await get('/?repo=github.com/JetBrains/example');
  assert.equal(scanned.status, 200);
  assert.match(scanned.html, /<title>JetBrains\/example · Skill Atlas<\/title>/);
  assert.match(scanned.html, /<input id="repo" name="repo" type="text" value="github.com\/JetBrains\/example"/);
  const link = `https://github.com/JetBrains/example/blob/${EXAMPLE_COMMIT}/.claude/skills/commits/SKILL.md`;
  assert.match(scanned.html, new RegExp(`<a class="link" href="${link}">${link}</a>`));
  assert.deepEqual(resultText(scanned.html), [
    'JetBrains/example · 1 skill',
    'commits — Write commit messages the way this repository does.',
    link,
  ]);
});

test('the same shape as the CLI: every skill sorted by name, the warnings under the list', async () => {
  const cli = await atlas(['scan', 'https://github.com/JetBrains/fixture']);
  assert.equal(cli.code, 0, cli.stderr);
  assert.match(cli.stderr, /^warning: \.agents\/skills\/release-checklist\/SKILL\.md: malformed front matter: /);
  const scanned = await get('/?repo=https://github.com/JetBrains/fixture');
  assert.equal(scanned.status, 200);
  const lines = (text: string) => text.split('\n').map((line) => line.trim());
  assert.deepEqual(resultText(scanned.html), [...lines(cli.stdout), ...lines(cli.stderr)]);
  assert.match(scanned.html, /<ul class="warnings">\n<li>warning: \.agents\/skills\/release-checklist\/SKILL\.md: malformed front matter: /);
});

/**
 * The elements the script touches, read off the served HTML: enough of a document to run the real
 * script in Node, with no browser. Each skill's name and description keep the HTML the script
 * writes into them; a list knows what was appended to it, and a node appended leaves its old list.
 */
function document(html: string) {
  type Element = { textContent: string; innerHTML: string };
  type Item = { hidden: boolean; dataset: { cluster?: string }; elements: Record<string, Element>; querySelector(selector: string): Element | null };
  const lists: Item[][] = [];
  const list = () => {
    const children: Item[] = [];
    lists.push(children);
    return {
      children,
      append: (...nodes: Item[]) => {
        for (const siblings of lists) for (const node of nodes) siblings.includes(node) && siblings.splice(siblings.indexOf(node), 1);
        children.push(...nodes);
      },
    };
  };
  const items: Item[] = [...html.matchAll(/<li(?: data-cluster="([^"]*)")?>\n<span class="name">([^<]*)<\/span>(?: — <span class="description">([^<]*)<\/span>)?/g)].map(
    ([, cluster, name, description]) => {
      const elements: Record<string, Element> = { '.name': { textContent: decode(name), innerHTML: name } };
      if (description !== undefined) elements['.description'] = { textContent: decode(description), innerHTML: description };
      return { hidden: false, dataset: { cluster: cluster === undefined ? undefined : decode(cluster) }, elements, querySelector: (selector: string) => elements[selector] ?? null };
    },
  );
  const flat = list();
  flat.append(...items);
  const sections = [...html.matchAll(/<div class="cluster"(?: data-cluster="([^"]*)")? hidden><h3>([^<]*)<span class="count">([^<]*)<\/span><\/h3>/g)].map(
    ([, cluster, heading, count]) => {
      const skills = list();
      return {
        hidden: true,
        dataset: { cluster: cluster === undefined ? undefined : decode(cluster) },
        heading: decode(heading + count),
        skills,
        querySelector: (selector: string) => (selector === 'ul' ? skills : null),
      };
    },
  );
  const count = { textContent: decode(/<span class="count">([^<]*)<\/span>/.exec(html)?.[1] ?? '') };
  const empty = { hidden: /<p class="empty" hidden>/.test(html) };
  const listeners: Record<string, () => void> = {};
  const field = { value: '', addEventListener: (type: string, listener: () => void) => void (listeners[type] = listener) };
  const toggle = { checked: false, addEventListener: (type: string, listener: () => void) => void (listeners[type] = listener) };
  const root = {
    getElementById: (id: string) => ({ filter: field, cluster: toggle })[id] ?? null,
    querySelector: (selector: string) => ({ '.repository .count': count, '.empty': empty, '.skills': flat })[selector] ?? null,
    querySelectorAll: (selector: string) => ({ '.skills > li': items, '.cluster': sections })[selector] ?? [],
  };
  install(root);
  const names = (nodes: Item[]) => nodes.filter((item) => !item.hidden).map((item) => item.elements['.name'].textContent);
  return {
    type(text: string) {
      field.value = text;
      listeners.input?.();
    },
    cluster(checked: boolean) {
      toggle.checked = checked;
      listeners.change?.();
    },
    shown: () => names(items),
    /** The shown skills as the page displays them, `<mark>` and all: `name — description`. */
    marked: () =>
      items
        .filter((item) => !item.hidden)
        .map((item) => [item.elements['.name'], item.elements['.description']].filter(Boolean).map((element) => element.innerHTML).join(' — ')),
    count: () => count.textContent,
    message: () => !empty.hidden,
    /** The skills shown in the flat list, by name. */
    listed: () => names(flat.children),
    /** Each shown cluster: its heading and the skills shown in it. */
    groups: () => sections.filter((section) => !section.hidden).map((section) => [section.heading, names(section.skills.children)]),
  };
}

test('a Filter field above the list and its script; the repository is fetched once, by the scan', async () => {
  const scanned = await get('/?repo=https://github.com/JetBrains/fixture');
  assert.equal(scanned.status, 200);
  assert.match(
    scanned.html,
    /<\/form>\n+<p class="filter">\n<label for="filter">Filter skills<\/label>\n<input id="filter" type="search"[^>]*>\n<label class="toggle"><input id="cluster" type="checkbox"> Cluster similar skills<\/label>\n<\/p>\n<section class="result">/,
  );
  assert.match(scanned.html, /<script type="module" src="\/filter\.js"><\/script>/);
  const script = await get('/filter.js');
  assert.equal(script.status, 200);
  assert.equal(script.type, 'text/javascript; charset=utf-8');
  assert.equal(script.html, readFileSync(FILTER_SCRIPT, 'utf8'));
  // Filtering is the page's: the script never asks the network, and the server knows no filter.
  assert.doesNotMatch(script.html, /\bfetch\b|XMLHttpRequest|location\./);
  const withQuery = await get('/?repo=https://github.com/JetBrains/fixture&filter=zzz');
  assert.deepEqual(resultText(withQuery.html), resultText(scanned.html));
  const home = await get('/');
  assert.doesNotMatch(home.html, /class="filter"|filter\.js/);
});

test('typing filters the list live: each word in the name or the description, M of N, the matches highlighted', async () => {
  const page = document((await get('/?repo=https://github.com/JetBrains/fixture')).html);
  assert.deepEqual(page.shown(), ['code-style', 'commits', 'release-checklist']);
  assert.equal(page.count(), '3 skills');
  assert.doesNotMatch(page.marked().join('\n'), /<mark>/);
  page.type('the'); // code-style and commits by their descriptions
  assert.deepEqual(page.shown(), ['code-style', 'commits']);
  assert.equal(page.count(), '2 of 3 skills');
  assert.equal(page.message(), false);
  assert.deepEqual(page.marked(), [
    'code-style — Follow <mark>the</mark> project&#39;s code style.',
    'commits — Write commit messages <mark>the</mark> way this repository does.',
  ]);
  page.type('the way'); // the list narrows as the words grow: each word on its own, "way" is in commits' description only
  assert.deepEqual(page.shown(), ['commits']);
  assert.equal(page.count(), '1 of 3 skills');
  assert.deepEqual(page.marked(), ['commits — Write commit messages <mark>the</mark> <mark>way</mark> this repository does.']);
  page.type('style'); // by name and description: every occurrence is marked
  assert.deepEqual(page.shown(), ['code-style']);
  assert.deepEqual(page.marked(), ['code-<mark>style</mark> — Follow the project&#39;s code <mark>style</mark>.']);
  page.type('cmt'); // not fuzzy: the characters in order are not enough
  assert.deepEqual(page.shown(), []);
});

test('the filter ignores case; the highlight keeps the text as written', async () => {
  const page = document((await get('/?repo=https://github.com/JetBrains/fixture')).html);
  page.type('Release'); // the malformed skill: a name, no description
  assert.deepEqual(page.shown(), ['release-checklist']);
  assert.equal(page.count(), '1 of 3 skills');
  assert.deepEqual(page.marked(), ['<mark>release</mark>-checklist']);
  page.type('CODE STYLE');
  assert.deepEqual(page.shown(), ['code-style']);
  assert.deepEqual(page.marked(), ['<mark>code</mark>-<mark>style</mark> — Follow the project&#39;s <mark>code</mark> <mark>style</mark>.']);
});

test('nothing matches → "No skill matches.", the warnings stay', async () => {
  const scanned = await get('/?repo=https://github.com/JetBrains/fixture');
  assert.match(scanned.html, /<\/ul>\n(?:<div class="cluster"[^\n]*\n)*<p class="empty" hidden>No skill matches\.<\/p>\n<ul class="warnings">\n<li>warning: /);
  const page = document(scanned.html);
  assert.equal(page.message(), false);
  page.type('zzz');
  assert.deepEqual(page.shown(), []);
  assert.equal(page.count(), '0 of 3 skills');
  assert.equal(page.message(), true);
});

test('an empty field shows the whole list again, N skills, nothing highlighted', async () => {
  const page = document((await get('/?repo=https://github.com/JetBrains/fixture')).html);
  page.type('style');
  page.type('   ');
  assert.deepEqual(page.shown(), ['code-style', 'commits', 'release-checklist']);
  assert.equal(page.count(), '3 skills');
  assert.equal(page.message(), false);
  assert.doesNotMatch(page.marked().join('\n'), /<mark>/);
});

test('the clusters come with the scan, carried in the page, hidden; the headings read as the CLI prints them', async () => {
  const scanned = await get('/?repo=https://github.com/JetBrains/fixture');
  assert.match(scanned.html, /<li data-cluster="commit">\n<span class="name">code-style<\/span>/);
  assert.match(scanned.html, /<li data-cluster="commit">\n<span class="name">commits<\/span>/);
  assert.match(scanned.html, /<li>\n<span class="name">release-checklist<\/span>/);
  assert.match(
    scanned.html,
    /<\/ul>\n<div class="cluster" data-cluster="commit" hidden><h3>commit · <span class="count">2 skills<\/span><\/h3><ul class="skills"><\/ul><\/div>\n<div class="cluster" hidden><h3>on their own · <span class="count">1 skill<\/span><\/h3><ul class="skills"><\/ul><\/div>\n<p class="empty" hidden>/,
  );
  const cli = await atlas(['scan', '--cluster', 'https://github.com/JetBrains/fixture']);
  const headings = [...scanned.html.matchAll(/<div class="cluster"[^>]*><h3>(.*?)<\/h3>/g)].map(([, heading]) => decode(heading.replace(/<[^>]*>/g, '')));
  assert.deepEqual(headings, cli.stdout.split('\n').filter((line) => / · \d+ skills?$/.test(line)).slice(1));
  // Nothing of it in the page without clusters, nor in the home page.
  const one = await get('/?repo=github.com/JetBrains/example');
  assert.doesNotMatch(one.html, /data-cluster/);
  assert.match(one.html, /<div class="cluster" hidden><h3>on their own · <span class="count">1 skill<\/span>/);
  assert.doesNotMatch((await get('/')).html, /class="cluster"|id="cluster"/);
});

test('the clusterer is pluggable in the web view too: another one, its headings in the page', async () => {
  const other = await startWeb({
    open: (input) => openGitHub(input, { fetch: github, token: 'test' }),
    cluster: (skills) => ({ clusters: [{ name: 'everything', skills }], alone: [] }),
  });
  try {
    const html = await (await fetch(new URL('/?repo=https://github.com/JetBrains/fixture', other.url))).text();
    assert.match(html, /<div class="cluster" data-cluster="everything" hidden><h3>everything · <span class="count">3 skills<\/span>/);
    assert.doesNotMatch(html, /on their own/);
    assert.equal((html.match(/<li data-cluster="everything">/g) ?? []).length, 3);
  } finally {
    await other.close();
  }
});

test('Cluster similar skills: checked, the skills regroup live under a heading per cluster; unchecked, the list by name again', async () => {
  const page = document((await get('/?repo=https://github.com/JetBrains/fixture')).html);
  assert.deepEqual(page.listed(), ['code-style', 'commits', 'release-checklist']);
  assert.deepEqual(page.groups(), []);
  page.cluster(true);
  assert.deepEqual(page.listed(), []);
  assert.deepEqual(page.groups(), [
    ['commit · 2 skills', ['code-style', 'commits']],
    ['on their own · 1 skill', ['release-checklist']],
  ]);
  assert.equal(page.count(), '3 skills');
  page.cluster(false);
  assert.deepEqual(page.listed(), ['code-style', 'commits', 'release-checklist']);
  assert.deepEqual(page.groups(), []);
});

test('the filter and the clusters combine: a hidden skill stays hidden, a cluster with no shown skill is hidden, M of N as ever', async () => {
  const page = document((await get('/?repo=https://github.com/JetBrains/fixture')).html);
  page.cluster(true);
  page.type('release');
  assert.deepEqual(page.groups(), [['on their own · 1 skill', ['release-checklist']]]);
  assert.equal(page.count(), '1 of 3 skills');
  assert.deepEqual(page.marked(), ['<mark>release</mark>-checklist']);
  page.type('zzz');
  assert.deepEqual(page.groups(), []);
  assert.equal(page.message(), true);
  page.type('');
  assert.deepEqual(page.groups(), [
    ['commit · 2 skills', ['code-style', 'commits']],
    ['on their own · 1 skill', ['release-checklist']],
  ]);
  // The filter typed first, then the checkbox: the same.
  const other = document((await get('/?repo=https://github.com/JetBrains/fixture')).html);
  other.type('style');
  other.cluster(true);
  assert.deepEqual(other.groups(), [['commit · 2 skills', ['code-style']]]);
  assert.equal(other.count(), '1 of 3 skills');
});

test('the page is self-contained: an inline stylesheet, no external stylesheet, web font or image', async () => {
  for (const path of ['/', '/?repo=https://github.com/JetBrains/fixture', '/?repo=./fixture']) {
    const { html } = await get(path);
    assert.match(html, /<style>[\s\S]+<\/style>/, path);
    assert.doesNotMatch(html, /<link\b|<img\b|@import|@font-face|url\(/, path);
  }
});

test('unreachable repository, or not a GitHub URL → a clear message in the page, status 400', async () => {
  const offline = await get('/?repo=https://github.com/JetBrains/not-answered');
  assert.equal(offline.status, 400);
  assert.match(offline.html, /<p class="error" role="alert">Cannot reach GitHub: not recorded: https:\/\/api\.github\.com\/repos\/JetBrains\/not-answered<\/p>/);
  assert.doesNotMatch(offline.html, /class="result"/);

  const local = await get('/?repo=./fixture');
  assert.equal(local.status, 400);
  assert.match(local.html, /<p class="error" role="alert">Not a GitHub repository URL: \.\/fixture<\/p>/);
});

test('what the user typed is escaped, in the field and in the message', async () => {
  const injected = await get(`/?repo=${encodeURIComponent('<script>alert("x")</script>')}`);
  assert.equal(injected.status, 400);
  assert.doesNotMatch(injected.html, /<script>/);
  assert.match(injected.html, /value="&lt;script&gt;alert\(&quot;x&quot;\)&lt;\/script&gt;"/);
  assert.match(injected.html, /Not a GitHub repository URL: &lt;script&gt;alert\(&quot;x&quot;\)&lt;\/script&gt;<\/p>/);
});

test('another path → 404', async () => {
  const missing = await get('/no-such-page');
  assert.equal(missing.status, 404);
  assert.match(missing.html, /Not found: \/no-such-page/);
});

test('node src/web.ts [port] serves the page and stores nothing', async (t) => {
  const cwd = mkdtempSync(join(tmpdir(), 'skill-atlas-web-'));
  const server = spawn(process.execPath, [WEB, '0'], { cwd, stdio: ['ignore', 'pipe', 'pipe'] });
  t.after(() => {
    server.kill();
    rmSync(cwd, { recursive: true, force: true });
  });
  const url = await new Promise<string>((resolve, reject) => {
    let out = '';
    server.stdout.on('data', (chunk) => {
      out += chunk;
      const match = /^Skill Atlas at (http:\/\/127\.0\.0\.1:\d+\/)\n/.exec(out);
      if (match) resolve(match[1]);
    });
    server.stderr.on('data', (chunk) => reject(new Error(String(chunk))));
    server.on('exit', (code) => reject(new Error(`exited with ${code}: ${out}`)));
  });
  const response = await fetch(url);
  assert.equal(response.status, 200);
  assert.match(await response.text(), /<input id="repo" name="repo"/);
  assert.deepEqual(readdirSync(cwd), []);
});

test('not a port → a clear message, exit code 1', () => {
  const bad = spawnSync(process.execPath, [WEB, 'eighty'], { encoding: 'utf8' });
  assert.equal(bad.status, 1);
  assert.match(bad.stderr, /^Not a port: eighty\n/);
});
