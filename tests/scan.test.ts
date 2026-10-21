// The decisions in spec/analysis.md and spec/cli.md, checked on what the real command prints for
// ./fixture and for a small GitHub repository answered in tests/helpers.ts. The edge cases of
// where skills live are yours to add.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { test } from 'node:test';
import { run } from '../src/commands.ts';
import { byWords } from '../src/core/cluster.ts';
import { openGitHub } from '../src/core/github.ts';
import { parseSkill } from '../src/core/parse.ts';
import { replay } from '../src/core/replay.ts';
import { atlas, CLI, EXAMPLE_COMMIT, FIXTURE, open } from './helpers.ts';

const fixture = await atlas(['scan', FIXTURE]);
const example = await atlas(['scan', 'github.com/JetBrains/example']);

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

test('scan --cluster: a blank line and `<word> · N skills` before each cluster, `on their own` before the rest; the flag before or after', async () => {
  const root = pathToFileURL(FIXTURE).href;
  const clustered = await atlas(['scan', '--cluster', FIXTURE]);
  assert.equal(clustered.code, 0, clustered.stderr);
  // commits, committing: one word, commit; `the`, `use` and `before` are stop words, release-checklist shares nothing.
  assert.equal(
    clustered.stdout,
    [
      'fixture · 3 skills',
      '',
      'commit · 2 skills',
      "code-style — Follow the project's code style.",
      `  ${root}/.github/skills/code-style/SKILL.md`,
      'commits — Write commit messages the way this repository does.',
      `  ${root}/.claude/skills/commits/SKILL.md`,
      '  also in .github/skills/commits/SKILL.md',
      '',
      'on their own · 1 skill',
      'release-checklist',
      `  ${root}/.agents/skills/release-checklist/SKILL.md`,
    ].join('\n'),
  );
  assert.equal(clustered.stderr, fixture.stderr);
  assert.equal((await atlas(['scan', FIXTURE, '--cluster'])).stdout, clustered.stdout);

  const one = await atlas(['scan', '--cluster', 'github.com/JetBrains/example']);
  assert.equal(one.stdout, [example.stdout.split('\n')[0], '', 'on their own · 1 skill', ...example.stdout.split('\n').slice(1)].join('\n'));

  const usage = await atlas(['scan', '--cluster']);
  assert.equal(usage.code, 1);
  assert.equal(usage.stderr, 'Usage: skill-atlas scan [--cluster] <GitHub URL | directory>');
});

test('clusters: the word most skills share first, ties alphabetically, named by the shortest form; by size, then name; stop words and endings ignored', async (t) => {
  const cwd = mkdtempSync(join(tmpdir(), 'skill-atlas-'));
  t.after(() => rmSync(cwd, { recursive: true, force: true }));
  const repository = join(cwd, 'clustered');
  const skills: Record<string, string> = {
    'branch-cleanup': 'Deletes merged branches.',
    branching: 'Branches off main.',
    'docs-site': 'Builds the site.',
    greeting: 'Use this before the standup.', // only stop words in common with publish
    'java-style': 'Formats Java sources.',
    'kotlin-style': 'Formats Kotlin sources.',
    'kotlin-tests': 'Runs the Kotlin tests of the repository.',
    publish: 'Use this before publishing the site.',
    'site-check': 'Checks the site links.',
    'sync-repos': 'Mirrors the repositories.',
    'tag-commit': 'Tags each commit.',
    'tagged-images': 'Tagged images.',
  };
  for (const [name, description] of Object.entries(skills)) {
    mkdirSync(join(repository, '.claude/skills', name), { recursive: true });
    writeFileSync(join(repository, '.claude/skills', name, 'SKILL.md'), `---\nname: ${name}\ndescription: ${description}\n---\n`);
  }
  const clustered = await atlas(['scan', '--cluster', repository]);
  assert.equal(clustered.code, 0, clustered.stderr);
  const headings = clustered.stdout.split('\n').filter((line) => !line.startsWith('  ') && !/^[a-z-]+ — /.test(line));
  // `site` is shared by three; then, among those left, `branch`, `format`, `kotlin`, `repository`, `source`, `style`
  // and `tag` by two each: alphabetically, `format` takes kotlin-style before `kotlin` can, so kotlin-tests pairs with
  // sync-repos by `repository`. branches, branching, branch and tags, tagged, tag are one word each.
  assert.deepEqual(headings, [
    'clustered · 12 skills',
    '',
    'site · 3 skills',
    '',
    'branch · 2 skills',
    '',
    'formats · 2 skills',
    '',
    'repository · 2 skills',
    '',
    'tag · 2 skills',
    '',
    'on their own · 1 skill',
  ]);
  const names = clustered.stdout.split('\n').filter((line) => / — /.test(line)).map((line) => line.split(' — ')[0]);
  assert.deepEqual(names, [
    'docs-site', 'publish', 'site-check',
    'branch-cleanup', 'branching',
    'java-style', 'kotlin-style',
    'kotlin-tests', 'sync-repos',
    'tag-commit', 'tagged-images',
    'greeting',
  ]);
});

test('the clusterer is pluggable: another one, its clusters printed the same', async () => {
  const stdout: string[] = [];
  const code = await run(['scan', '--cluster', FIXTURE], {
    open,
    print: (text) => stdout.push(text),
    error: () => {},
    cluster: (skills) => ({ clusters: [{ name: 'everything', skills }], alone: [] }),
  });
  assert.equal(code, 0);
  assert.deepEqual(stdout.slice(0, 3), ['fixture · 3 skills', '', 'everything · 3 skills']);
  assert.deepEqual(stdout.slice(3), fixture.stdout.split('\n').slice(1));
});

test('clusters cross repositories: the skill\'s repository plays no part', async () => {
  const skill = (repository: string, name: string, description: string) => ({
    id: `${repository}:.claude/skills/${name}/SKILL.md`,
    repository,
    path: `.claude/skills/${name}/SKILL.md`,
    name,
    description,
    commit: '',
    copies: [],
  });
  const { clusters, alone } = await byWords([skill('a/one', 'commits', 'Writes commits.'), skill('b/two', 'commit-style', 'Commit messages.')]);
  assert.deepEqual(clusters.map(({ name, skills }) => [name, skills.map((skill) => skill.repository)]), [['commit', ['b/two', 'a/one']]]);
  assert.deepEqual(alone, []);
});
