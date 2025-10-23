import { test, expect } from '@playwright/test';

// e2e: All Teams page shows team rosters correctly
// - Register two users, join lobby
// - Admin starts draft
// - Each makes one pick
// - Navigate to "Все команды" from lobby
// - Verify both teams are displayed with slots

test.setTimeout(60_000);

test('All Teams page displays team rosters', async ({ browser, baseURL }) => {
  const rnd = Math.random().toString(36).slice(2, 8);
  const u1 = `u1-${rnd}`;
  const u2 = `u2-${rnd}`;
  const roomId = `room-${rnd}`;

  const ctx1 = await browser.newContext();
  const ctx2 = await browser.newContext();
  const p1 = await ctx1.newPage();
  const p2 = await ctx2.newPage();

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

  await register(p1, u1, 'pass1234', `Team ${u1}`);
  await register(p2, u2, 'pass1234', `Team ${u2}`);

  // Wait until both pages show at least 2 participants (>=2)
  await expect.poll(async () => {
    const txt = (await p1.getByTestId('participants-count').textContent())?.trim() || '0';
    return Number(txt);
  }, { timeout: 20000 }).toBeGreaterThanOrEqual(2);
  await expect.poll(async () => {
    const txt = (await p2.getByTestId('participants-count').textContent())?.trim() || '0';
    return Number(txt);
  }, { timeout: 20000 }).toBeGreaterThanOrEqual(2);

  // Detect admin via is-admin-flag and wait for start button to attach
  const flag1 = p1.getByTestId('is-admin-flag');
  const flag2 = p2.getByTestId('is-admin-flag');
  await Promise.all([
    flag1.waitFor({ timeout: 20000 }).catch(() => {}),
    flag2.waitFor({ timeout: 20000 }).catch(() => {}),
  ]);
  await expect.poll(async () => {
    const [t1, t2] = await Promise.all([flag1.textContent(), flag2.textContent()]);
    const v1 = (t1 || '').trim() === '1' ? 1 : 0;
    const v2 = (t2 || '').trim() === '1' ? 1 : 0;
    return v1 + v2;
  }, { timeout: 20000 }).toBe(1);
  const isAdmin1 = (((await flag1.textContent()) || '').trim() === '1');
  const admin = isAdmin1 ? p1 : p2;
  const adminStart = isAdmin1 ? p1.getByTestId('start-draft-btn') : p2.getByTestId('start-draft-btn');
  await adminStart.waitFor({ state: 'attached', timeout: 20000 });
  await expect(adminStart).toBeVisible({ timeout: 20000 });
  await expect(adminStart).toBeEnabled();
  await adminStart.click();

  // Both should land in DraftRoom
  await expect(p1.getByRole('heading', { name: 'Fantasy Draft' })).toBeVisible({ timeout: 20000 });
  await expect(p2.getByRole('heading', { name: 'Fantasy Draft' })).toBeVisible({ timeout: 20000 });

  // Each player makes a pick (first available player)
  // p1 picks
  await expect(p1.getByTestId('turn-status')).toContainText('ВАШ ХОД', { timeout: 10_000 });
  const p1PickBtn = p1.getByRole('button', { name: 'Pick' }).first();
  await p1PickBtn.click();
  
  // p2 picks
  await expect(p2.getByTestId('turn-status')).toContainText('ВАШ ХОД', { timeout: 10_000 });
  const p2PickBtn = p2.getByRole('button', { name: 'Pick' }).first();
  await p2PickBtn.click();

  // Navigate back to lobby (or directly use All Teams button if available in draft)
  // For simplicity, go back to lobby first
  // Accept confirm dialog on exit
  p1.once('dialog', async (d) => { await d.accept(); });
  const exitBtn = p1.getByRole('button', { name: /Выход/ });
  await exitBtn.click();
  await expect(p1.getByRole('heading', { name: 'Лобби драфта' })).toBeVisible({ timeout: 10_000 });

  // Click "Все команды" button
  const allTeamsBtn = p1.getByRole('button', { name: /Все команды/ });
  await expect(allTeamsBtn).toBeVisible();
  await allTeamsBtn.click();

  // Should see All Teams page
  await expect(p1.getByRole('heading', { name: 'Таблица команд' })).toBeVisible({ timeout: 10_000 });

  // Verify both teams are displayed (check team names)
  await expect(p1.getByText(`Team ${u1}`)).toBeVisible();
  await expect(p1.getByText(`Team ${u2}`)).toBeVisible();

  // Verify roster slots are displayed (LW, C, RW, D, D, G)
  const slots = ['LW', 'C', 'RW', 'D', 'G'];
  for (const slot of slots) {
    const cell = p1.locator('td').filter({ hasText: slot }).first();
    await expect(cell).toBeVisible();
  }

  await ctx1.close();
  await ctx2.close();
});
