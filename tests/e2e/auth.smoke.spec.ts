import { expect, test } from '@playwright/test';

test('login loads without a client error', async ({ page }) => {
  await page.goto('/auth');
  await expect(page).toHaveTitle(/Help Desk|Astrotur/i);
  await expect(page.locator('body')).not.toContainText('Não foi possível exibir esta tela');
});
