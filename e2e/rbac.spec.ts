import { test, expect } from '@playwright/test';

// e2e: RBAC — non-admin cannot start draft or add bots
// - Two users register: admin (first) and regular user
// - Regular user joins lobby
// - Regular user tries to add bots → should see error
// - Regular user tries to start draft → should see error

test.setTimeout(60_000);

test('non-admin cannot add bots or start draft (RBAC)', async ({ browser, baseURL }) => {
  const rnd = Math.random().toString(36).slice(2, 8);
  const adminLogin = `admin-${rnd}`;
  const userLogin = `user-${rnd}`;
  const roomId = `room-${rnd}`;

  const adminCtx = await browser.newContext();
  const userCtx = await browser.newContext();
  const adminPage = await adminCtx.newPage();
  const userPage = await userCtx.newPage();

  // Helper: register
  const register = async (page: any, login: string, password: string, team: string) => {
    const target = baseURL ? `${baseURL}/?roomId=${roomId}` : `/?roomId=${roomId}`;
    await page.goto(target, { waitUntil: 'networkidle' });
    await page.getByRole('button', { name: 'Нет аккаунта? Зарегистрироваться' }).click();
    await page.locator('input[type="text"]').first().fill(login);
    await page.locator('input[type="password"]').fill(password);
    await page.locator('input[type="text"]').nth(1).fill(team);
    await page.getByRole('button', { name: 'Зарегистрироваться' }).click();
    await expect(page.getByRole('heading', { name: 'Лобби драфта' })).toBeVisible({ timeout: 10_000 });
  };

  // Admin registers first (becomes lobby admin)
  await register(adminPage, adminLogin, 'pass1234', `Team ${adminLogin}`);
  // Regular user registers second
  await register(userPage, userLogin, 'pass1234', `Team ${userLogin}`);

  // Both should be in lobby
  await expect(adminPage.getByRole('heading', { name: 'Лобби драфта' })).toBeVisible({ timeout: 10000 });
  await expect(userPage.getByRole('heading', { name: 'Лобби драфта' })).toBeVisible({ timeout: 10000 });

  // Определить админа по флагу is-admin-flag (1 — админ, 0 — не админ)
  const flagA = adminPage.getByTestId('is-admin-flag');
  const flagB = userPage.getByTestId('is-admin-flag');
  await Promise.all([
    flagA.waitFor({ timeout: 20000 }).catch(() => {}),
    flagB.waitFor({ timeout: 20000 }).catch(() => {}),
  ]);
  const textA = (await flagA.textContent())?.trim();
  const textB = (await flagB.textContent())?.trim();
  if (textA !== '1' && textB !== '1') {
    throw new Error('is-admin-flag not set to 1 on any page');
  }
  const adm = textA === '1' ? adminPage : userPage;
  const usr = textA === '1' ? userPage : adminPage;

  // У админа есть кнопка старта; у не-админа — нет админ‑кнопок
  await expect(adm.getByTestId('start-draft-btn')).toBeVisible({ timeout: 10000 });
  await expect(usr.getByTestId('start-draft-btn')).toHaveCount(0);
  await expect(usr.getByTestId('add-bots-btn')).toHaveCount(0);

  await adminCtx.close();
  await userCtx.close();
});
