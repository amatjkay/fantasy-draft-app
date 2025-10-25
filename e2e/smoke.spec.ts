import { test, expect } from '@playwright/test';

// Basic smoke test to ensure client app renders in debug mode and servers are up
// Requires webServer in playwright.config.ts to start server (3001) and client (5173)

test('loads login page and shows heading', async ({ page }) => {
  await page.goto('/', { waitUntil: 'networkidle' });
  // UI на русском языке
  await expect(page.getByRole('heading', { name: /Fantasy Draft/i })).toBeVisible();
  await expect(page.getByTestId('login-input')).toBeVisible();
  await expect(page.getByTestId('password-input')).toBeVisible();
});
