import type { Demo } from '../../../tests/demo.ts';

export default async ({ page, click, type, point, pause, snapshot }: Demo) => {
  await pause(800);
  await type(page.getByLabel('GitHub repository URL'), 'https://github.com/JetBrains/fixture');
  await click(page.getByRole('button', { name: 'Scan' }));
  await page.locator('.result, .error').first().waitFor();
  await point(page.locator('.repository'));
  await snapshot('result');
  await pause(1200);
  const filter = page.getByLabel('Filter skills');
  // One word: the list narrows to the skills whose name or description has it, each occurrence marked.
  await type(filter, 'style');
  await point(page.locator('.skills li:visible mark').first());
  await snapshot('one-word');
  await pause(1800);
  // Words match on their own: "the" is in two descriptions; "the way" in one.
  await filter.fill('');
  await type(filter, 'the');
  await point(page.locator('.count'));
  await snapshot('common-word');
  await pause(1500);
  await type(filter, ' way');
  await point(page.locator('.skills li:visible mark').last());
  await snapshot('two-words');
  await pause(1800);
  // Not fuzzy: the characters in order are not enough.
  await filter.fill('');
  await type(filter, 'cmt');
  await point(page.locator('.empty'));
  await snapshot('no-match');
  await pause(1800);
  // Clearing the field brings the whole list back, unmarked.
  await filter.fill('');
  await filter.dispatchEvent('input');
  await point(page.locator('.repository'));
  await snapshot('cleared');
  await pause(2000);
};
