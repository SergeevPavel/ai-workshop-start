// Runs the commands the way the CLI does, with GitHub answering from EXAMPLE below.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { run } from '../src/commands.ts';
import { openGitHub, parseGitHubUrl } from '../src/core/github.ts';
import { replay, type Recording } from '../src/core/replay.ts';
import { openDirectory } from '../src/local.ts';

export const FIXTURE = fileURLToPath(new URL('../fixture', import.meta.url));
export const CLI = fileURLToPath(new URL('../src/cli.ts', import.meta.url));

/** The commit GitHub answers for JetBrains/example. */
export const EXAMPLE_COMMIT = '5ab6270ab772d113e8ad52ebfcaa0109c522ae00';

/** What GitHub answers for a small repository, JetBrains/example, with one skill. */
const EXAMPLE: Recording = {
  'https://api.github.com/repos/JetBrains/example': { status: 200, body: { full_name: 'JetBrains/example', default_branch: 'main' } },
  'https://api.github.com/repos/JetBrains/example/commits/main': { status: 200, body: { sha: EXAMPLE_COMMIT } },
  'https://api.github.com/search/code?q=filename:SKILL.md+repo:JetBrains/example&per_page=100&page=1': {
    status: 200,
    body: { total_count: 1, items: [{ path: '.claude/skills/commits/SKILL.md' }] },
  },
  [`https://raw.githubusercontent.com/JetBrains/example/${EXAMPLE_COMMIT}/.claude/skills/commits/SKILL.md`]: {
    status: 200,
    body: '---\nname: commits\ndescription: Write commit messages the way this repository does. Use for every commit.\n---\n# Commits\n',
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

/** GitHub, answering from the recordings above. */
export const github = replay({ ...EXAMPLE, ...FIXTURE_REPOSITORY });

/** Opens what the CLI opens, with GitHub answering from the recordings: through code search, with a token. */
export const open = (input: string) =>
  parseGitHubUrl(input) ? openGitHub(input, { fetch: github, token: 'test' }) : openDirectory(input);

/** `skill-atlas <args>`, as the CLI runs it, with GitHub answering from EXAMPLE. */
export async function atlas(args: string[]) {
  const stdout: string[] = [];
  const stderr: string[] = [];
  const code = await run(args, {
    open,
    print: (text) => stdout.push(text),
    error: (text) => stderr.push(text),
  });
  return { code, stdout: stdout.join('\n'), stderr: stderr.join('\n') };
}
