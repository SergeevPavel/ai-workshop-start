// The web view's server: one page, served over node:http. Each request scans anew; nothing is
// stored. Only GitHub repositories and organizations: a web page does not list local directories.
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { AtlasError } from './core/errors.ts';
import { scan, scanOrganization, type OrganizationSource, type Source } from './core/scan.ts';
import { page } from './page.ts';

export type WebOptions = {
  /** Opens the repository, or the organization, the field names. */
  open(input: string): Promise<Source | OrganizationSource>;
  /** 0, the default, picks a free port. */
  port?: number;
  host?: string;
};

export type Answer = { status: number; body: string };

/** Answers `GET /` and `GET /?repo=<URL>`; anything else is 404. */
export function createHandler({ open }: Pick<WebOptions, 'open'>) {
  return async (url: URL): Promise<Answer> => {
    if (url.pathname !== '/') return { status: 404, body: page({ repo: '', error: `Not found: ${url.pathname}` }) };
    const repo = url.searchParams.get('repo')?.trim() ?? '';
    if (!repo) return { status: 200, body: page({ repo }) };
    try {
      const source = await open(repo);
      const result = 'organization' in source ? await scanOrganization(source) : await scan(source);
      return { status: 200, body: page({ repo, result }) };
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
      const { status, body } = await handle(new URL(request.url ?? '/', `http://${host}`));
      response.writeHead(status, { 'Content-Type': 'text/html; charset=utf-8' }).end(body);
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
