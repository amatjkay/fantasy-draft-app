import { test, expect } from '@playwright/test';

// e2e: Admin actions (pause/resume)
test.describe('Admin Actions', () => {
  let adminContext: any;
  let userContext: any;
  let adminPage: any;
  let userPage: any;
  let roomId: string;
  let adminId: string;
  let userId: string;

  test.beforeAll(async ({ browser }) => {
    const rnd = Math.random().toString(36).slice(2, 8);
    roomId = `room-${rnd}`;

    // Create contexts
    adminContext = await browser.newContext();
    userContext = await browser.newContext();
    adminPage = await adminContext.newPage();
    userPage = await userContext.newPage();

    // Register admin via UI (with roomId in URL)
    // First user will automatically be admin thanks to auth.ts logic
    await adminPage.goto(`/?roomId=${roomId}`);
    await adminPage.getByRole('button', { name: 'Нет аккаунта? Зарегистрироваться' }).click();
    await adminPage.locator('input[type="text"]').first().fill(`admin-${rnd}`);
    await adminPage.locator('input[type="password"]').fill('password');
    await adminPage.locator('input[type="text"]').nth(1).fill('Admin Team');
    await adminPage.getByRole('button', { name: 'Зарегистрироваться' }).click();
    await expect(adminPage.getByRole('heading', { name: 'Лобби драфта' })).toBeVisible();
    adminId = await adminPage.evaluate(() => JSON.parse(localStorage.getItem('user') || '{}').id);

    // Register second user via UI (with roomId in URL)
    await userPage.goto(`/?roomId=${roomId}`);
    await userPage.getByRole('button', { name: 'Нет аккаунта? Зарегистрироваться' }).click();
    await userPage.locator('input[type="text"]').first().fill(`user-${rnd}`);
    await userPage.locator('input[type="password"]').fill('password');
    await userPage.locator('input[type="text"]').nth(1).fill('User Team');
    await userPage.getByRole('button', { name: 'Зарегистрироваться' }).click();
    await expect(userPage.getByRole('heading', { name: 'Лобби драфта' })).toBeVisible();
    userId = await userPage.evaluate(() => JSON.parse(localStorage.getItem('user') || '{}').id);
    
    // Both users should now be in the correct room
    await expect(adminPage.getByTestId('participants-count')).toContainText('2');
    await adminPage.getByRole('button', { name: /Начать драфт/ }).click();
    await expect(adminPage.getByRole('heading', { name: 'Fantasy Draft' })).toBeVisible();
  });

  test('admin can pause and resume the draft', async () => {
    // Pause
    const pauseRes = await adminPage.request.post('/api/draft/pause', { 
      data: { roomId },
      headers: { 'Content-Type': 'application/json' }
    });
    if (!pauseRes.ok()) {
      console.log('Pause request failed:', pauseRes.status(), await pauseRes.text());
    }
    expect(pauseRes.ok()).toBeTruthy();
    let state = (await pauseRes.json()).draftState;
    expect(state.paused).toBe(true);

    // Resume
    const resumeRes = await adminPage.request.post('/api/draft/resume', { 
      data: { roomId },
      headers: { 'Content-Type': 'application/json' }
    });
    expect(resumeRes.ok()).toBeTruthy();
    state = (await resumeRes.json()).draftState;
    expect(state.paused).toBe(false);
  });

  test('non-admin cannot pause or resume the draft', async () => {
    // Attempt to pause
    const pauseRes = await userPage.request.post('/api/draft/pause', { 
      data: { roomId },
      headers: { 'Content-Type': 'application/json' }
    });
    expect(pauseRes.status()).toBe(403);

    // Attempt to resume
    const resumeRes = await userPage.request.post('/api/draft/resume', { 
      data: { roomId },
      headers: { 'Content-Type': 'application/json' }
    });
    expect(resumeRes.status()).toBe(403);
  });
});
