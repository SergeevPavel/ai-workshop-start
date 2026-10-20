// Runs the commands the way the CLI does, with GitHub answering from the recordings below.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { run } from '../src/commands.ts';
import { openGitHub, parseGitHubUrl } from '../src/core/github.ts';
import { replay, type Recorded, type Recording } from '../src/core/replay.ts';
import { openDirectory } from '../src/local.ts';

export const FIXTURE = fileURLToPath(new URL('../fixture', import.meta.url));
export const CLI = fileURLToPath(new URL('../src/cli.ts', import.meta.url));

/** The commit GitHub answers for JetBrains/example. */
export const EXAMPLE_COMMIT = '5ab6270ab772d113e8ad52ebfcaa0109c522ae00';

/**
 * What GitHub answers for a small repository, JetBrains/example, with one skill: the same file
 * as the fixture's, so an organization scan sees it in both repositories.
 */
const EXAMPLE: Recording = {
  'https://api.github.com/repos/JetBrains/example': { status: 200, body: { full_name: 'JetBrains/example', default_branch: 'main' } },
  'https://api.github.com/repos/JetBrains/example/commits/main': { status: 200, body: { sha: EXAMPLE_COMMIT } },
  'https://api.github.com/search/code?q=filename:SKILL.md+repo:JetBrains/example&per_page=100&page=1': {
    status: 200,
    body: { total_count: 1, items: [{ path: '.claude/skills/commits/SKILL.md' }] },
  },
  [`https://raw.githubusercontent.com/JetBrains/example/${EXAMPLE_COMMIT}/.claude/skills/commits/SKILL.md`]: {
    status: 200,
    body: readFileSync(join(FIXTURE, '.claude/skills/commits/SKILL.md'), 'utf8'),
  },
};

/** The fixture directory as a GitHub repository, JetBrains/fixture: three skills, one malformed. */
const FIXTURE_PATHS = ['.agents/skills/release-checklist/SKILL.md', '.claude/skills/commits/SKILL.md', '.github/skills/code-style/SKILL.md'];
const FIXTURE_REPOSITORY: Recording = {
  'https://api.github.com/repos/JetBrains/fixture': { status: 200, body: { full_name: 'JetBrains/fixture', default_branch: 'main' } },
  'https://api.github.com/repos/JetBrains/fixture/commits/main': { status: 200, body: { sha: EXAMPLE_COMMIT } },
  'https://api.github.com/search/code?q=filename:SKILL.md+repo:JetBrains/fixture&per_page=100&page=1': {
    status: 200,
    body: { total_count: FIXTURE_PATHS.length, items: FIXTURE_PATHS.map((path) => ({ path })) },
  },
  ...Object.fromEntries(
    FIXTURE_PATHS.map((path) => [
      `https://raw.githubusercontent.com/JetBrains/fixture/${EXAMPLE_COMMIT}/${path}`,
      { status: 200, body: readFileSync(join(FIXTURE, path), 'utf8') },
    ]),
  ),
};

/**
 * JetBrains, the organization of the two repositories above. With a token, one code search finds
 * their files; without it, the repository list also has JetBrains/docs, without a skill, and
 * JetBrains/empty, without a commit.
 */
const ORGANIZATION: Recording = {
  'https://api.github.com/users/JetBrains': { status: 200, body: { login: 'JetBrains', type: 'Organization' } },
  'https://api.github.com/users/no-such-owner': { status: 404, body: { message: 'Not Found' } },
  'https://api.github.com/search/code?q=filename:SKILL.md+org:JetBrains&per_page=100&page=1': {
    status: 200,
    body: {
      total_count: 1 + FIXTURE_PATHS.length,
      items: [
        { path: '.claude/skills/commits/SKILL.md', repository: { full_name: 'JetBrains/example' } },
        ...FIXTURE_PATHS.map((path) => ({ path, repository: { full_name: 'JetBrains/fixture' } })),
      ],
    },
  },
  'https://api.github.com/orgs/JetBrains/repos?per_page=100&page=1': {
    status: 200,
    body: ['JetBrains/fixture', 'JetBrains/example', 'JetBrains/docs', 'JetBrains/empty'].map((full_name) => ({ full_name, default_branch: 'main' })),
  },
  'https://api.github.com/repos/JetBrains/docs/commits/main': { status: 200, body: { sha: EXAMPLE_COMMIT } },
  'https://api.github.com/repos/JetBrains/empty/commits/main': { status: 409, body: { message: 'Git Repository is empty.' } },
  [`https://api.github.com/repos/JetBrains/example/git/trees/${EXAMPLE_COMMIT}?recursive=1`]: tree(['.claude/skills/commits/SKILL.md', 'README.md']),
  [`https://api.github.com/repos/JetBrains/fixture/git/trees/${EXAMPLE_COMMIT}?recursive=1`]: tree([...FIXTURE_PATHS, 'README.md']),
  [`https://api.github.com/repos/JetBrains/docs/git/trees/${EXAMPLE_COMMIT}?recursive=1`]: tree(['README.md']),
};

/** A git tree of regular files, not truncated. */
function tree(paths: string[]): Recorded {
  return { status: 200, body: { truncated: false, tree: paths.map((path) => ({ path, mode: '100644', type: 'blob', sha: '' })) } };
}

/** GitHub, answering from the recordings above. */
export const github = replay({ ...EXAMPLE, ...FIXTURE_REPOSITORY, ...ORGANIZATION });

/** Opens what the CLI opens, with GitHub answering from the recordings: through code search, with a token. */
export const open = (input: string, token = 'test') =>
  parseGitHubUrl(input) ? openGitHub(input, { fetch: github, token: token || undefined }) : openDirectory(input);

/** `skill-atlas <args>`, as the CLI runs it, with GitHub answering from the recordings; `token: ''` is no GITHUB_TOKEN. */
export async function atlas(args: string[], { token = 'test' }: { token?: string } = {}) {
  const stdout: string[] = [];
  const stderr: string[] = [];
  const code = await run(args, {
    open: (input) => open(input, token),
    print: (text) => stdout.push(text),
    error: (text) => stderr.push(text),
  });
  return { code, stdout: stdout.join('\n'), stderr: stderr.join('\n') };
}
