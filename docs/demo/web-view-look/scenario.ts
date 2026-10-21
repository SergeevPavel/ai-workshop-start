import type { Demo } from '../../../tests/demo.ts';

// The look: the bar, the cards, the badge and the callouts; light, dark, and the error.
export default async ({ page, click, type, point, pause, snapshot }: Demo) => {
  await pause(800);
  await snapshot('start');
  await type(page.getByLabel('GitHub repository URL'), 'https://github.com/JetBrains/fixture');
  await click(page.getByRole('button', { name: 'Scan' }));
  await page.locator('.result, .error').first().waitFor();
  await point(page.locator('.repository .count'));
  await snapshot('result');
  await pause(1500);
  await type(page.getByLabel('Filter skills'), 'style');
  await point(page.locator('.skills li:visible mark').first());
  await snapshot('filtered');
  await pause(1500);
  // The same page as the system turns dark.
  await page.emulateMedia({ colorScheme: 'dark' });
  await pause(400);
  await snapshot('dark');
  await pause(2000);
  await page.emulateMedia({ colorScheme: 'light' });
  // A repository GitHub does not answer for: the error callout.
  const field = page.getByLabel('GitHub repository URL');
  await field.fill('');
  await type(field, 'https://github.com/JetBrains/not-answered');
  await click(page.getByRole('button', { name: 'Scan' }));
  await page.locator('.error').waitFor();
  await point(page.locator('.error'));
  await snapshot('error');
  await pause(2000);
};
