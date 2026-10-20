// The decisions in spec/analysis.md and spec/cli.md, checked on what the real command prints for
// ./fixture and for a small GitHub repository answered in tests/helpers.ts. The edge cases of
// where skills live are yours to add.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { test } from 'node:test';
import { openGitHub } from '../src/core/github.ts';
import { parseSkill } from '../src/core/parse.ts';
import { replay } from '../src/core/replay.ts';
import { atlas, CLI, EXAMPLE_COMMIT, FIXTURE } from './helpers.ts';

const fixture = await atlas(['scan', FIXTURE]);
const example = await atlas(['scan', 'github.com/JetBrains/example']);
const organization = await atlas(['scan', 'https://github.com/JetBrains']);

test('malformed front matter → the directory name, no description and a warning', () => {
  const parsed = parseSkill(readFileSync(join(FIXTURE, '.agents/skills/release-checklist/SKILL.md'), 'utf8'));
  assert.equal(parsed.name, undefined);
  assert.equal(parsed.description, '');
  assert.equal(
    parsed.warning,
    'malformed front matter: Nested mappings are not allowed in compact mappings at line 3, column 14; using the directory name',
  );
});

test('scan prints the repository, then each skill with its first sentence and pinned link', () => {
  assert.equal(example.code, 0, example.stderr);
  assert.equal(
    example.stdout,
    [
      'JetBrains/example · 1 skill',
      'commits — Write commit messages the way this repository does.',
      `  https://github.com/JetBrains/example/blob/${EXAMPLE_COMMIT}/.claude/skills/commits/SKILL.md`,
    ].join('\n'),
  );
});

test('./fixture: every skill, sorted by name, linked to its file, identical copies folded, with a warning for the malformed one', () => {
  const root = pathToFileURL(FIXTURE).href;
  assert.equal(fixture.code, 0);
  assert.equal(
    fixture.stdout,
    [
      'fixture · 3 skills',
      "code-style — Follow the project's code style.",
      `  ${root}/.github/skills/code-style/SKILL.md`,
      'commits — Write commit messages the way this repository does.',
      `  ${root}/.claude/skills/commits/SKILL.md`,
      '  also in .github/skills/commits/SKILL.md',
      'release-checklist',
      `  ${root}/.agents/skills/release-checklist/SKILL.md`,
    ].join('\n'),
  );
  assert.match(fixture.stderr, /^warning: \.agents\/skills\/release-checklist\/SKILL\.md: malformed front matter: /);
});

test('the CLI prints the result at once and stores nothing', (t) => {
  const cwd = mkdtempSync(join(tmpdir(), 'skill-atlas-'));
  t.after(() => rmSync(cwd, { recursive: true, force: true }));
  const scanned = spawnSync(process.execPath, [CLI, 'scan', FIXTURE], { cwd, encoding: 'utf8' });
  assert.equal(scanned.status, 0, scanned.stderr);
  assert.equal(scanned.stdout, `${fixture.stdout}\n`);
  assert.deepEqual(readdirSync(cwd), []);
});

test('unreachable repository → a clear message, exit code 1', async () => {
  const missing = spawnSync(process.execPath, [CLI, 'scan', join(FIXTURE, 'no-such-directory')], { encoding: 'utf8' });
  assert.equal(missing.status, 1);
  assert.match(missing.stderr, /^Not a GitHub URL or a readable directory: .*no-such-directory\n$/);

  // What GitHub answers for a repository that does not exist.
  const notFound = replay({ 'https://api.github.com/repos/JetBrains/no-such-repository': { status: 404, body: { message: 'Not Found' } } });
  await assert.rejects(openGitHub('https://github.com/JetBrains/no-such-repository', { fetch: notFound }), {
    message: 'Repository not found: https://github.com/JetBrains/no-such-repository',
  });

  const offline = await atlas(['scan', 'https://github.com/JetBrains/not-answered']);
  assert.equal(offline.code, 1);
  assert.match(offline.stderr, /^Cannot reach GitHub: not recorded: https:\/\/api\.github\.com\/repos\/JetBrains\/not-answered$/);
});

test('an organization: the skills grouped by repository; identical content in two repositories, each naming the other as a copy', () => {
  assert.equal(organization.code, 0, organization.stderr);
  assert.equal(
    organization.stdout,
    [
      'JetBrains · 4 skills in 2 repositories',
      '',
      'JetBrains/example · 1 skill',
      'commits — Write commit messages the way this repository does.',
      `  https://github.com/JetBrains/example/blob/${EXAMPLE_COMMIT}/.claude/skills/commits/SKILL.md`,
      '  also in JetBrains/fixture:.claude/skills/commits/SKILL.md',
      '',
      'JetBrains/fixture · 3 skills',
      "code-style — Follow the project's code style.",
      `  https://github.com/JetBrains/fixture/blob/${EXAMPLE_COMMIT}/.github/skills/code-style/SKILL.md`,
      'commits — Write commit messages the way this repository does.',
      `  https://github.com/JetBrains/fixture/blob/${EXAMPLE_COMMIT}/.claude/skills/commits/SKILL.md`,
      '  also in JetBrains/example:.claude/skills/commits/SKILL.md',
      'release-checklist',
      `  https://github.com/JetBrains/fixture/blob/${EXAMPLE_COMMIT}/.agents/skills/release-checklist/SKILL.md`,
    ].join('\n'),
  );
  assert.match(organization.stderr, /^warning: JetBrains\/fixture: \.agents\/skills\/release-checklist\/SKILL\.md: malformed front matter: [^\n]*$/);
});

test('without GITHUB_TOKEN: every listed repository through its tree; no skills → left out; no commit → a warning, the scan goes on', async () => {
  const listed = await atlas(['scan', 'github.com/JetBrains'], { token: '' });
  assert.equal(listed.code, 0, listed.stderr);
  assert.equal(listed.stdout, organization.stdout);
  assert.match(
    listed.stderr,
    /^warning: JetBrains\/fixture: \.agents\/skills\/release-checklist\/SKILL\.md: malformed front matter: [^\n]*\nwarning: JetBrains\/empty: GitHub answered 409 for https:\/\/api\.github\.com\/repos\/JetBrains\/empty\/commits\/main: Git Repository is empty\.; skipped$/,
  );
});

test('unknown organization → a clear message, exit code 1', async () => {
  const unknown = await atlas(['scan', 'https://github.com/no-such-owner']);
  assert.equal(unknown.code, 1);
  assert.equal(unknown.stderr, 'Not found on GitHub: https://github.com/no-such-owner');
});

test('GitHub rate-limited or unreachable while opening a repository → the organization scan stops', async () => {
  // What GitHub answers for an organization with one repository, when the limit is reached at its commit.
  const listed = {
    'https://api.github.com/users/JetBrains': { status: 200, body: { login: 'JetBrains', type: 'Organization' } },
    'https://api.github.com/orgs/JetBrains/repos?per_page=100&page=1': { status: 200, body: [{ full_name: 'JetBrains/kotlin', default_branch: 'master' }] },
  };
  const limited = replay({
    ...listed,
    'https://api.github.com/repos/JetBrains/kotlin/commits/master': { status: 403, body: { message: 'API rate limit exceeded for 192.0.2.1.' } },
  });
  await assert.rejects(openGitHub('https://github.com/JetBrains', { fetch: limited }), {
    message: 'GitHub rate limit reached; set GITHUB_TOKEN',
  });
  await assert.rejects(openGitHub('https://github.com/JetBrains', { fetch: replay(listed) }), {
    message: 'Cannot reach GitHub: not recorded: https://api.github.com/repos/JetBrains/kotlin/commits/master',
  });
});

test('rate limit → a message that asks for GITHUB_TOKEN', async () => {
  const limited = replay({
    'https://api.github.com/repos/JetBrains/MPS': {
      status: 403,
      body: { message: 'API rate limit exceeded for 192.0.2.1. (But here is the good news: ...)' },
    },
  });
  await assert.rejects(openGitHub('https://github.com/JetBrains/MPS', { fetch: limited }), {
    message: 'GitHub rate limit reached; set GITHUB_TOKEN',
  });
});
