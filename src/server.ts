// The web view's server: one page, served over node:http. Each request scans anew; nothing is
// stored. Only GitHub repositories: a web page does not list local directories.
import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { byWords, type Clusterer } from './core/cluster.ts';
import { AtlasError } from './core/errors.ts';
import { scan, type Source } from './core/scan.ts';
import { page } from './page.ts';

export type WebOptions = {
  /** Opens the repository the field names. */
  open(input: string): Promise<Source>;
  /** 0, the default, picks a free port. */
  port?: number;
  host?: string;
  /** Groups similar skills for the page's checkbox; the core's word heuristic by default. */
  cluster?: Clusterer;
};

/** HTML unless `type` says otherwise. */
export type Answer = { status: number; body: string; type?: string };

/** The page's only script, the live filter; read once, served as is. */
const FILTER_SCRIPT = readFileSync(new URL('./client/filter.js', import.meta.url), 'utf8');

/** Answers `GET /`, `GET /?repo=<URL>` and `GET /filter.js`; anything else is 404. */
export function createHandler({ open, cluster = byWords }: Pick<WebOptions, 'open' | 'cluster'>) {
  return async (url: URL): Promise<Answer> => {
    if (url.pathname === '/filter.js') return { status: 200, type: 'text/javascript; charset=utf-8', body: FILTER_SCRIPT };
    if (url.pathname !== '/') return { status: 404, body: page({ repo: '', error: `Not found: ${url.pathname}` }) };
    const repo = url.searchParams.get('repo')?.trim() ?? '';
    if (!repo) return { status: 200, body: page({ repo }) };
    try {
      const result = await scan(await open(repo));
      return { status: 200, body: page({ repo, result: { ...result, clusters: await cluster(result.skills) } }) };
    } catch (error) {
      if (!(error instanceof AtlasError)) throw error;
      return { status: 400, body: page({ repo, error: error.message }) };
    }
  };
}

/** Starts the server; `url` is where it listens, `close` stops it. */
export async function startWeb(options: WebOptions) {
  const handle = createHandler(options);
  const host = options.host ?? '127.0.0.1';
  const server = createServer(async (request, response) => {
    try {
      const { status, body, type } = await handle(new URL(request.url ?? '/', `http://${host}`));
      response.writeHead(status, { 'Content-Type': type ?? 'text/html; charset=utf-8' }).end(body);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      response.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' }).end(`Unexpected error: ${message}\n`);
    }
  });
  await new Promise<void>((resolve, reject) => server.once('error', reject).listen(options.port ?? 0, host, resolve));
  const { port } = server.address() as AddressInfo;
  return {
    url: `http://${host}:${port}/`,
    close: () => new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve()))),
  };
}
