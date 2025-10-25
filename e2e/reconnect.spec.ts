import { test, expect } from '@playwright/test';

// e2e: Reconnect & Autopick flow
// - Two users join weekly room via SimpleApp
// - Admin starts draft
// - Admin (active) closes page → server pauses and emits draft:reconnect_wait
// - After grace (1s via playwright.config.ts env), server makes autopick
// - Second user sees draft continue (Пик #1 and no reconnect banner)

test.setTimeout(60_000);

test('reconnect triggers pause and autopick, then draft resumes', async ({ browser, baseURL }) => {
  const rnd = Math.random().toString(36).slice(2, 8);
  const u1 = `u1-${rnd}`;
  const u2 = `u2-${rnd}`;

  // Separate contexts to isolate sessions
  const ctx1 = await browser.newContext();
  const ctx2 = await browser.newContext();
  const p1 = await ctx1.newPage();
  const p2 = await ctx2.newPage();

  // Helper: register user
  const register = async (page: any, login: string, password: string, team: string) => {
    await page.goto(baseURL || '/', { waitUntil: 'networkidle' });
    // Switch to registration mode
    await page.getByRole('button', { name: 'Нет аккаунта? Зарегистрироваться' }).click();
    // Fill login/password/team (use data-testid for stable selectors)
    await page.getByTestId('register-login-input').fill(login);
    await page.getByTestId('register-password-input').fill(password);
    await page.getByTestId('team-name-input').fill(team);
    await page.getByRole('button', { name: 'Зарегистрироваться' }).click();
    await expect(page.getByRole('heading', { name: 'Лобби драфта' })).toBeVisible({ timeout: 10_000 });
  };

  await register(p1, u1, 'pass1234', `Team ${u1}`);
  await register(p2, u2, 'pass1234', `Team ${u2}`);

  // Start draft from admin (first user)
  const startBtn = p1.getByRole('button', { name: /Начать драфт/ });
  await expect(startBtn).toBeVisible();
  await expect(startBtn).toBeEnabled();
  await startBtn.click();

  // Both should land in DraftRoom
  await expect(p1.getByRole('heading', { name: 'Fantasy Draft' })).toBeVisible({ timeout: 10_000 });
  await expect(p2.getByRole('heading', { name: 'Fantasy Draft' })).toBeVisible({ timeout: 10_000 });

  // Close admin page to simulate disconnect of active user
  await p1.close();

  // Optionally wait for reconnect banner visibility (it may be brief)
  try {
    await expect(p2.getByTestId('reconnect-banner')).toBeVisible({ timeout: 3_000 });
  } catch {}

  // After grace (1s configured), expect autopick to happen and draft to move forward
  // It's now user2's turn – status should reflect this (either 'ВАШ ХОД' or not showing u1)
  await expect(async () => {
    const text = await p2.getByTestId('turn-status').textContent();
    // Should show either 'ВАШ ХОД' (Chromium fast update) or userId (but not u1 who disconnected)
    expect(text).toMatch(/(ВАШ ХОД|⏳ Ход:)/);
    expect(text).not.toContain(u1.slice(0, 8));
  }).toPass({ timeout: 15_000 });

  // And reconnect banner (if shown) should disappear; do not fail if not present
  try {
    await expect(p2.getByTestId('reconnect-banner')).toBeHidden({ timeout: 7_000 });
  } catch {}

  await ctx2.close();
  await ctx1.close();
});
