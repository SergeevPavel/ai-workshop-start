import type { Demo } from '../../../tests/demo.ts';

// Cluster similar skills: the checkbox regroups the cards live, combines with the filter, and back.
export default async ({ page, click, type, point, pause, snapshot }: Demo) => {
  await pause(800);
  await type(page.getByLabel('GitHub repository URL'), 'https://github.com/JetBrains/fixture');
  await click(page.getByRole('button', { name: 'Scan' }));
  await page.locator('.result, .error').first().waitFor();
  await point(page.getByLabel('Cluster similar skills'));
  await snapshot('result');
  await pause(1200);
  // commits and code-style share the word commit; release-checklist is on its own.
  await click(page.getByLabel('Cluster similar skills'));
  await point(page.locator('.cluster:visible h3').first());
  await snapshot('clustered');
  await pause(2500);
  // The filter hides code-style; the cluster stays, with commits alone in it.
  await type(page.getByLabel('Filter skills'), 'write');
  await point(page.locator('.skills li:visible mark').first());
  await snapshot('filtered');
  await pause(2000);
  const filter = page.getByLabel('Filter skills');
  await filter.fill('');
  await pause(600);
  // Unchecked: the list by name again.
  await click(page.getByLabel('Cluster similar skills'));
  await point(page.locator('.skills li').first());
  await snapshot('flat');
  await pause(2000);
};
