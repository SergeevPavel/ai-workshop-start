#!/usr/bin/env node
// The web view: `node src/web.ts [port]`, a page with a field for a GitHub repository or
// organization URL and the skills it finds, in the CLI's shape. GITHUB_TOKEN works as for the CLI.
import { openGitHub } from './core/github.ts';
import { startWeb } from './server.ts';

const token = process.env.GITHUB_TOKEN || undefined;
const port = Number(process.argv[2] ?? process.env.PORT ?? 3000);
if (!Number.isInteger(port) || port < 0 || port > 65535) {
  console.error(`Not a port: ${process.argv[2]}\n\nUsage: node src/web.ts [port]`);
  process.exit(1);
}

const web = await startWeb({ port, open: (input) => openGitHub(input, { fetch, token }) });
console.log(`Skill Atlas at ${web.url}`);
