// The decisions in spec/web-view.md, checked over HTTP on the real server, with GitHub answering
// from tests/helpers.ts.
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { after, before, test } from 'node:test';
import { openGitHub } from '../src/core/github.ts';
import { startWeb } from '../src/server.ts';
import { atlas, EXAMPLE_COMMIT, github } from './helpers.ts';

const WEB = fileURLToPath(new URL('../src/web.ts', import.meta.url));

let web: Awaited<ReturnType<typeof startWeb>>;
// As src/web.ts opens repositories: GitHub only, here through code search, with a token.
before(async () => (web = await startWeb({ open: (input) => openGitHub(input, { fetch: github, token: 'test' }) })));
after(() => web.close());

async function get(path: string) {
  const response = await fetch(new URL(path, web.url));
  return { status: response.status, type: response.headers.get('content-type'), html: await response.text() };
}

/** The text of the result section, one line per CLI line: tags dropped, entities decoded. */
function resultText(html: string): string[] {
  const section = /<section class="result">([\s\S]*?)<\/section>/.exec(html);
  assert.ok(section, 'the page has a result section');
  return section[1]
    .split('\n')
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

const FIXTURE_LINK = (path: string) => `https://github.com/JetBrains/fixture/blob/${EXAMPLE_COMMIT}/${path}`;
const FIXTURE_WARNING = /^warning: \.agents\/skills\/release-checklist\/SKILL\.md: malformed front matter: /;

test('&filter=<text>: the skills whose name or description has the characters in order, M of N', async () => {
  // "cmt": commits by name; code-style by "committing" in its description; not release-checklist.
  const filtered = await get('/?repo=https://github.com/JetBrains/fixture&filter=cmt');
  assert.equal(filtered.status, 200);
  assert.match(filtered.html, /<form method="get" action="\/" class="filter">\n<input type="hidden" name="repo" value="https:\/\/github\.com\/JetBrains\/fixture">/);
  assert.match(filtered.html, /<input id="filter" name="filter" type="search" value="cmt"/);
  const lines = resultText(filtered.html);
  assert.deepEqual(lines.slice(0, -1), [
    'JetBrains/fixture · 2 of 3 skills',
    "code-style — Follow the project's code style.",
    FIXTURE_LINK('.github/skills/code-style/SKILL.md'),
    'commits — Write commit messages the way this repository does.',
    FIXTURE_LINK('.claude/skills/commits/SKILL.md'),
  ]);
  assert.match(lines.at(-1) ?? '', FIXTURE_WARNING);
});

test('the filter ignores case and spaces', async () => {
  const filtered = await get('/?repo=https://github.com/JetBrains/fixture&filter=Release+Check');
  assert.equal(filtered.status, 200);
  const lines = resultText(filtered.html);
  assert.deepEqual(lines.slice(0, -1), [
    'JetBrains/fixture · 1 of 3 skills',
    'release-checklist',
    FIXTURE_LINK('.agents/skills/release-checklist/SKILL.md'),
  ]);
});

test('nothing matches → "No skill matches.", the warnings stay', async () => {
  const empty = await get('/?repo=https://github.com/JetBrains/fixture&filter=zzz');
  assert.equal(empty.status, 200);
  const lines = resultText(empty.html);
  assert.deepEqual(lines.slice(0, -1), ['JetBrains/fixture · 0 of 3 skills', 'No skill matches.']);
  assert.match(lines.at(-1) ?? '', FIXTURE_WARNING);
  assert.match(empty.html, /<p class="empty">No skill matches\.<\/p>/);
});

test('an empty filter, or one without a result, changes nothing; the field keeps the text, escaped', async () => {
  const unfiltered = await get('/?repo=https://github.com/JetBrains/fixture');
  const blank = await get('/?repo=https://github.com/JetBrains/fixture&filter=+++');
  assert.equal(blank.status, 200);
  assert.deepEqual(resultText(blank.html), resultText(unfiltered.html));
  assert.match(blank.html, /<input id="filter" name="filter" type="search" value=""/);

  const home = await get('/?filter=cmt');
  assert.equal(home.status, 200);
  assert.doesNotMatch(home.html, /class="result"|class="filter"/);

  const offline = await get('/?repo=https://github.com/JetBrains/not-answered&filter=cmt');
  assert.equal(offline.status, 400);
  assert.doesNotMatch(offline.html, /class="result"|class="filter"/);

  const injected = await get(`/?repo=https://github.com/JetBrains/example&filter=${encodeURIComponent('<b>"x"</b>')}`);
  assert.equal(injected.status, 200);
  assert.doesNotMatch(injected.html, /<b>/);
  assert.match(injected.html, /<input id="filter" name="filter" type="search" value="&lt;b&gt;&quot;x&quot;&lt;\/b&gt;"/);
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
