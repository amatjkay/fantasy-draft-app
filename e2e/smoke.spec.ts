import { test, expect } from '@playwright/test';

// Basic smoke test to ensure client app renders in debug mode and servers are up
// Requires webServer in playwright.config.ts to start server (3001) and client (5173)

test('loads debug app root and shows heading', async ({ page }) => {
  await page.goto('/?debug=1', { waitUntil: 'networkidle' });
  await expect(page.getByRole('heading', { name: 'Fantasy Draft Client' })).toBeVisible();
  await expect(page.getByText('Simple React client for REST API.')).toBeVisible();
});
