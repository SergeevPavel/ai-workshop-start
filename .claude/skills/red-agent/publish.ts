#!/usr/bin/env node
// Publishes a bug's folder, test-results/red-agent/<slug>, so an issue can show its demo: GitHub
// shows a committed GIF inline, but `gh` uploads no attachments. The files go into a commit on the
// `red-agent-demos` branch of `origin`, on top of its last one, with no checkout and nothing in the
// working tree. The URLs pin the commit, so they survive whatever happens to the branch.
//
//   node .claude/skills/red-agent/publish.ts <slug>
//
// Prints one line per file, `<name> <URL>`: a raw URL for a GIF or PNG, to embed as an image; the
// file's page on GitHub for the rest.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const BRANCH = 'red-agent-demos';
const usage = 'Usage: node .claude/skills/red-agent/publish.ts <slug>';
const [slug, ...extra] = process.argv.slice(2);
if (!slug || extra.length > 0 || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)) {
  console.error(`Expected one slug in kebab-case, e.g. fork-scan-zero-skills\n\n${usage}`);
  process.exit(1);
}
const ROOT = fileURLToPath(new URL('../../..', import.meta.url));
const folder = join(ROOT, 'test-results/red-agent', slug);
if (!existsSync(folder)) {
  console.error(`No folder: ${folder}; record the demo or write the transcript first\n\n${usage}`);
  process.exit(1);
}
const files = readdirSync(folder)
  .filter((name) => statSync(join(folder, name)).isFile())
  .sort();
if (files.length === 0) throw new Error(`Nothing to publish in ${folder}`);

const git = (args: string[], env: Record<string, string> = {}) =>
  execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'] }).trim();

// The URL as configured: `git remote get-url` would apply an insteadOf rewrite to it.
const remote = git(['config', '--get', 'remote.origin.url']);
const match = /github\.com[/:]([^/]+)\/([^/]+?)(?:\.git)?\/?$/.exec(remote);
if (!match) throw new Error(`origin is not a GitHub repository: ${remote}`);
const [, owner, repo] = match;

let parent: string | undefined;
try {
  git(['fetch', '--quiet', 'origin', BRANCH]);
  parent = git(['rev-parse', 'FETCH_HEAD']);
} catch {
  // The first publication: the branch does not exist yet.
}

// A temporary index: the working tree and the real index stay as they are.
const scratch = mkdtempSync(join(tmpdir(), 'red-agent-publish-'));
const env = { GIT_INDEX_FILE: join(scratch, 'index') };
try {
  if (parent) {
    git(['read-tree', parent], env);
    // A re-publication replaces the folder: the files of the last one MUST NOT linger.
    const stale = git(['ls-tree', '-r', '--name-only', parent, `${slug}/`]).split('\n').filter(Boolean);
    if (stale.length > 0) git(['update-index', '--force-remove', '--', ...stale], env);
  } else git(['read-tree', '--empty'], env);
  for (const name of files) {
    const blob = git(['hash-object', '-w', '--', join(folder, name)]);
    git(['update-index', '--add', '--cacheinfo', `100644,${blob},${slug}/${name}`], env);
  }
  const tree = git(['write-tree'], env);
  const message = `red-agent: ${slug}\n\nCo-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`;
  const commit = git(['commit-tree', tree, ...(parent ? ['-p', parent] : []), '-m', message]);
  git(['push', '--quiet', 'origin', `${commit}:refs/heads/${BRANCH}`]);
  for (const name of files) {
    const url = /\.(gif|png)$/i.test(name)
      ? `https://raw.githubusercontent.com/${owner}/${repo}/${commit}/${slug}/${name}`
      : `https://github.com/${owner}/${repo}/blob/${commit}/${slug}/${name}`;
    console.log(`${name} ${url}`);
  }
} finally {
  rmSync(scratch, { recursive: true, force: true });
}
