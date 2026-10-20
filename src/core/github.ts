import { AtlasError } from './errors.ts';
import { SKILL_ROOTS } from './find.ts';
import type { OrganizationSource, Source } from './scan.ts';

/** The part of `fetch` the core uses, so tests and the browser can pass their own. */
export type Fetch = (url: string, init?: { headers?: Record<string, string> }) => Promise<Response>;

export type GitHubOptions = {
  fetch: Fetch;
  /** With a token, skills are found through code search; without it, through the tree. */
  token?: string;
};

const API = 'https://api.github.com';
const RAW = 'https://raw.githubusercontent.com';

/** GitHub as a whole is not answering, not one repository: an organization scan MUST stop. */
class GitHubUnavailable extends AtlasError {}

/**
 * `https://github.com/owner/repo`, or `https://github.com/owner` for an organization; with or
 * without the scheme, a trailing slash or `.git`.
 */
export function parseGitHubUrl(input: string): { owner: string; repo?: string } | undefined {
  const match = /^(?:https?:\/\/)?(?:www\.)?github\.com\/([\w.-]+)(?:\/([\w.-]+?)(?:\.git)?)?\/?$/i.exec(input.trim());
  return match ? { owner: match[1], repo: match[2] } : undefined;
}

/** Opens a repository, or every repository of an organization. */
export async function openGitHub(input: string, options: GitHubOptions): Promise<Source | OrganizationSource> {
  const name = parseGitHubUrl(input);
  if (!name) throw new AtlasError(`Not a GitHub URL: ${input}`);
  const github = client(options);
  if (!name.repo) return openOrganization(github, name.owner, options.token);
  const info = await github.json<Info>(
    `${API}/repos/${name.owner}/${name.repo}`,
    `Repository not found: https://github.com/${name.owner}/${name.repo}`,
  );
  return openRepository(github, info, options.token);
}

/** What the repository answers say about it. */
type Info = { full_name: string; default_branch: string };

/** Resolves the default branch to a commit and lists the files that may be skills, unless `paths` has them. */
async function openRepository(github: Client, info: Info, token: string | undefined, paths?: string[]): Promise<Source> {
  const id = info.full_name;
  const { sha } = await github.json<{ sha: string }>(`${API}/repos/${id}/commits/${encodePath(info.default_branch)}`);
  const warnings: string[] = [];
  paths ??= token ? await searchPaths(github, id) : await treePaths(github, id, sha, warnings);
  const [organization, repo] = id.split('/');
  return {
    repository: { id, organization, name: repo, url: `https://github.com/${id}`, commit: sha },
    paths,
    warnings,
    read: (path) => github.raw(`${RAW}/${id}/${sha}/${encodePath(path)}`),
  };
}

/**
 * Every repository of the organization (a user's work the same). With a token, one code search
 * finds the files of the whole organization; without it, each listed repository is opened.
 * A repository that cannot be opened is a warning; GitHub not answering is not.
 */
async function openOrganization(github: Client, owner: string, token: string | undefined): Promise<OrganizationSource> {
  const account = await github.json<{ login: string; type: string }>(`${API}/users/${owner}`, `Not found on GitHub: https://github.com/${owner}`);
  const organization = account.login;
  const found = token ? await searchOrganization(github, account) : await listRepositories(github, account);
  const opened = await Promise.all(
    found.map(async ({ id, info, paths }): Promise<Source | string> => {
      try {
        return await openRepository(github, info ?? (await github.json<Info>(`${API}/repos/${id}`)), token, paths);
      } catch (error) {
        if (!(error instanceof AtlasError) || error instanceof GitHubUnavailable) throw error;
        return `${error.message}; skipped`;
      }
    }),
  );
  const repositories: Source[] = [];
  const warnings: string[] = [];
  opened.forEach((result, index) => {
    if (typeof result === 'string') warnings.push(`${found[index].id}: ${result}`);
    else repositories.push(result);
  });
  return { organization, url: `https://github.com/${organization}`, repositories, warnings };
}

/** A repository to open, with what the listing already knows: its answers, its files. */
type Found = { id: string; info?: Info; paths?: string[] };

/** The repositories with a SKILL.md, by one code search over the organization. */
async function searchOrganization(github: Client, account: { login: string; type: string }): Promise<Found[]> {
  const qualifier = account.type === 'Organization' ? 'org' : 'user';
  const paths = new Map<string, Set<string>>(); // by repository; pages can repeat a result
  // GitHub returns at most 1000 results: ten pages.
  for (let page = 1; page <= 10; page++) {
    const result = await github.json<{ total_count: number; items: { path: string; repository: { full_name: string } }[] }>(
      `${API}/search/code?q=filename:SKILL.md+${qualifier}:${account.login}&per_page=100&page=${page}`,
    );
    for (const { path, repository } of result.items) {
      paths.set(repository.full_name, (paths.get(repository.full_name) ?? new Set()).add(path));
    }
    if (result.items.length < 100 || page * 100 >= result.total_count) break;
  }
  return [...paths].map(([id, found]) => ({ id, paths: [...found] }));
}

/** Every repository the organization lists, 100 a page. */
async function listRepositories(github: Client, account: { login: string; type: string }): Promise<Found[]> {
  const url = account.type === 'Organization' ? `${API}/orgs/${account.login}/repos` : `${API}/users/${account.login}/repos`;
  const found: Found[] = [];
  for (let page = 1; ; page++) {
    const repositories = await github.json<Info[]>(`${url}?per_page=100&page=${page}`);
    found.push(...repositories.map((info) => ({ id: info.full_name, info })));
    if (repositories.length < 100) return found;
  }
}

/** Code search looks at the whole default branch, 100 results a page. */
async function searchPaths(github: Client, id: string): Promise<string[]> {
  const paths = new Set<string>(); // pages can repeat a result
  // GitHub returns at most 1000 results: ten pages.
  for (let page = 1; page <= 10; page++) {
    const result = await github.json<{ total_count: number; items: { path: string }[] }>(
      `${API}/search/code?q=filename:SKILL.md+repo:${id}&per_page=100&page=${page}`,
    );
    for (const item of result.items) paths.add(item.path);
    if (result.items.length < 100 || page * 100 >= result.total_count) break;
  }
  return [...paths];
}

type Tree = { truncated: boolean; tree: { path: string; mode: string; type: string; sha: string }[] };

/** The whole tree at once, or only the skill roots when it is too large for one answer. */
async function treePaths(github: Client, id: string, sha: string, warnings: string[]): Promise<string[]> {
  const tree = await github.json<Tree>(`${API}/repos/${id}/git/trees/${sha}?recursive=1`);
  if (!tree.truncated) return files(tree);
  warnings.push(`the tree is too large to list at once; looked only in ${SKILL_ROOTS.join(', ')} (GITHUB_TOKEN searches everywhere)`);
  const paths: string[] = [];
  for (const root of SKILL_ROOTS) {
    const rootSha = await directory(github, id, sha, root);
    if (!rootSha) continue;
    const subtree = await github.json<Tree>(`${API}/repos/${id}/git/trees/${rootSha}?recursive=1`);
    paths.push(...files(subtree).map((path) => `${root}/${path}`));
  }
  return paths;
}

/** Walks down one level at a time; the directory's tree, or undefined if it does not exist. */
async function directory(github: Client, id: string, sha: string, path: string): Promise<string | undefined> {
  let current = sha;
  for (const segment of path.split('/')) {
    const tree = await github.json<Tree>(`${API}/repos/${id}/git/trees/${current}`);
    const entry = tree.tree.find((item) => item.path === segment && item.type === 'tree');
    if (!entry) return undefined;
    current = entry.sha;
  }
  return current;
}

/** Regular files only: a symbolic link's content is its target, not a SKILL.md. */
function files(tree: Tree): string[] {
  return tree.tree.filter((item) => item.type === 'blob' && item.mode !== '120000').map((item) => item.path);
}

type Client = ReturnType<typeof client>;

function client({ fetch, token }: GitHubOptions) {
  const headers: Record<string, string> = { Accept: 'application/vnd.github+json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const answers = new Map<string, Promise<unknown>>(); // the root tree is asked for once per skill root

  async function get(url: string, init?: { headers: Record<string, string> }): Promise<Response> {
    try {
      return await fetch(url, init);
    } catch (error) {
      throw new GitHubUnavailable(`Cannot reach GitHub: ${describe(error)}`);
    }
  }

  async function request(url: string, notFound: string): Promise<unknown> {
    const response = await get(url, { headers });
    if (response.ok) return response.json();
    const body: unknown = await response.json().catch(() => undefined);
    const message = (body as { message?: unknown } | undefined)?.message;
    const text = typeof message === 'string' ? message : '';
    if (response.status === 404) throw new AtlasError(notFound);
    if ((response.status === 403 || response.status === 429) && /rate limit/i.test(text)) {
      throw new GitHubUnavailable(`GitHub rate limit reached; ${token ? 'try again in a minute' : 'set GITHUB_TOKEN'}`);
    }
    if (response.status === 401) throw new GitHubUnavailable('GitHub rejected the token in GITHUB_TOKEN');
    throw new AtlasError(`GitHub answered ${response.status} for ${url}${text && `: ${text}`}`);
  }

  return {
    /** A GitHub API answer; `notFound` explains a 404. */
    json<T>(url: string, notFound = `Not found on GitHub: ${url}`): Promise<T> {
      if (!answers.has(url)) answers.set(url, request(url, notFound));
      return answers.get(url) as Promise<T>;
    },
    /** A file's bytes at the scanned commit, or undefined if it is not there. */
    async raw(url: string): Promise<Uint8Array | undefined> {
      const response = await get(url);
      if (response.status === 404) return undefined;
      if (!response.ok) throw new AtlasError(`GitHub answered ${response.status} for ${url}`);
      return new Uint8Array(await response.arrayBuffer());
    },
  };
}

function encodePath(path: string): string {
  return path.split('/').map(encodeURIComponent).join('/');
}

function describe(error: unknown): string {
  if (!(error instanceof Error)) return String(error);
  return error.cause instanceof Error ? `${error.message} (${error.cause.message})` : error.message;
}
