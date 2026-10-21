import type { Demo } from '../../../tests/demo.ts';

// With GITHUB_TOKEN set, a fork scans as `0 skills`: GitHub's code search leaves out forks with fewer
// stars than their parent, and the scan trusts the empty answer. Live GitHub: record with --live.
export default async ({ page, click, type, point, pause, snapshot }: Demo) => {
  await pause(800);
  await type(page.getByLabel('GitHub repository URL'), 'https://github.com/SergeevPavel/ai-workshop-start');
  await click(page.getByRole('button', { name: 'Scan' }));
  await page.locator('.result, .error').first().waitFor();
  await point(page.locator('.count'));
  await snapshot('zero-skills');
  await pause(3000);
  // The same repository on GitHub: the skills are there.
  await page.goto('https://github.com/SergeevPavel/ai-workshop-start/tree/main/.claude/skills');
  await page.getByText('issue-to-pr').first().waitFor();
  await snapshot('on-github');
  await pause(3000);
};
