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
 * The elements the filter script touches, read off the served HTML: enough of a document to run
 * the real script in Node, with no browser.
 */
function document(html: string) {
  const items = [...html.matchAll(/<li class="skill" data-name="([^"]*)" data-description="([^"]*)">/g)].map(
    ([, name, description]) => ({ hidden: false, dataset: { name: decode(name), description: decode(description) } }),
  );
  const count = { textContent: decode(/<span class="count">([^<]*)<\/span>/.exec(html)?.[1] ?? '') };
  const empty = { hidden: /<p class="empty" hidden>/.test(html) };
  const listeners: Record<string, () => void> = {};
  const field = { value: '', addEventListener: (type: string, listener: () => void) => void (listeners[type] = listener) };
  const root = {
    getElementById: (id: string) => (id === 'filter' ? field : null),
    querySelector: (selector: string) => ({ '.count': count, '.empty': empty })[selector] ?? null,
    querySelectorAll: (selector: string) => (selector === '.skills > li' ? items : []),
  };
  install(root);
  return {
    type(text: string) {
      field.value = text;
      listeners.input?.();
    },
    shown: () => items.filter((item) => !item.hidden).map((item) => item.dataset.name),
    count: () => count.textContent,
    message: () => !empty.hidden,
  };
}

test('a Filter field above the list and its script; the repository is fetched once, by the scan', async () => {
  const scanned = await get('/?repo=https://github.com/JetBrains/fixture');
  assert.equal(scanned.status, 200);
  assert.match(scanned.html, /<\/form>\n+<p class="filter">\n<label for="filter">Filter skills<\/label>\n<input id="filter" type="search"[^>]*>\n<\/p>\n<section class="result">/);
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

test('typing filters the list live: the characters in order in the name or the description, M of N', async () => {
  const page = document((await get('/?repo=https://github.com/JetBrains/fixture')).html);
  assert.deepEqual(page.shown(), ['code-style', 'commits', 'release-checklist']);
  assert.equal(page.count(), '3 skills');
  page.type('cmt'); // commits by name; code-style by "committing" in its description
  assert.deepEqual(page.shown(), ['code-style', 'commits']);
  assert.equal(page.count(), '2 of 3 skills');
  assert.equal(page.message(), false);
  page.type('cmtw'); // the list narrows as the text grows: "the way" is in commits' description only
  assert.deepEqual(page.shown(), ['commits']);
  assert.equal(page.count(), '1 of 3 skills');
});

test('the filter ignores case and spaces', async () => {
  const page = document((await get('/?repo=https://github.com/JetBrains/fixture')).html);
  page.type('Release Check');
  assert.deepEqual(page.shown(), ['release-checklist']);
  assert.equal(page.count(), '1 of 3 skills');
  page.type('CODE STYLE');
  assert.deepEqual(page.shown(), ['code-style']);
});

test('nothing matches → "No skill matches.", the warnings stay', async () => {
  const scanned = await get('/?repo=https://github.com/JetBrains/fixture');
  assert.match(scanned.html, /<\/ul>\n<p class="empty" hidden>No skill matches\.<\/p>\n<ul class="warnings">\n<li>warning: /);
  const page = document(scanned.html);
  assert.equal(page.message(), false);
  page.type('zzz');
  assert.deepEqual(page.shown(), []);
  assert.equal(page.count(), '0 of 3 skills');
  assert.equal(page.message(), true);
});

test('an empty field shows the whole list again, N skills', async () => {
  const page = document((await get('/?repo=https://github.com/JetBrains/fixture')).html);
  page.type('zzz');
  page.type('   ');
  assert.deepEqual(page.shown(), ['code-style', 'commits', 'release-checklist']);
  assert.equal(page.count(), '3 skills');
  assert.equal(page.message(), false);
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
  const scanned = await get('/?repo=https://github.com/JetBrains/fixture');
  assert.match(scanned.html, /<li class="skill" data-name="code-style" data-description="Follow the project&#39;s code style\. /);
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
