// Every demo in docs/demo as an acceptance test: the scenario runs and each snapshot matches its
// golden. Outside the Playwright image, each demo runs inside it, through Docker.
import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import { test } from 'node:test';
import { DEMOS, inDocker, inPlaywrightImage, runDemo } from './demo.ts';

for (const feature of readdirSync(DEMOS, { withFileTypes: true }).filter((entry) => entry.isDirectory())) {
  test(`demo ${feature.name}`, () => {
    if (inPlaywrightImage) return runDemo(feature.name);
    const docker = inDocker(
      ['--input-type=module', '-e', "await (await import('./tests/demo.ts')).runDemo(process.argv[1])", feature.name],
      'pipe',
    );
    assert.equal(docker.status, 0, `${docker.stdout}${docker.stderr}`);
  });
}
