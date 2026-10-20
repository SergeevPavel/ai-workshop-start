import type { Demo } from '../../../tests/demo.ts';

export default async ({ page, click, type, point, pause, snapshot }: Demo) => {
  await pause(800);
  await snapshot('start');
  await type(page.getByLabel('GitHub repository URL'), 'https://github.com/JetBrains/fixture');
  await snapshot('typed');
  await click(page.getByRole('button', { name: 'Scan' }));
  await page.locator('.result, .error').first().waitFor();
  await point(page.locator('.repository'));
  await snapshot('result');
  await pause(1500);
  for (const skill of await page.locator('.skills li').all()) {
    await point(skill.locator('.name'));
    await pause(800);
    await point(skill.locator('.link'));
    await pause(800);
  }
  await pause(1500);
};
