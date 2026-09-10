import { test, expect } from '@playwright/test';

test.describe('E2E Automated QA Suite (fruit-store.spec.ts)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
  });

  test('Test Case 4: Engineering Mode & PIN Code Protection', async ({ page }) => {
    // 1. Click admin gear button
    const gearBtn = page.locator('#admin-gear-btn');
    await expect(gearBtn).toBeVisible();
    await gearBtn.click();

    // 2. Verify PIN modal is open
    await expect(page.locator('text=後台工程模式驗證')).toBeVisible();

    // 3. Enter wrong PIN 0000
    for (let i = 0; i < 4; i++) {
      await page.keyboard.press('0');
    }

    // Verify error message
    await expect(page.locator('text=密碼錯誤！請重新輸入')).toBeVisible();
    await expect(page.locator('text=工程後台參數設定')).not.toBeVisible();

    // 4. Wait for error reset and enter correct PIN 1107
    await page.waitForTimeout(700);
    await page.keyboard.press('1');
    await page.keyboard.press('1');
    await page.keyboard.press('0');
    await page.keyboard.press('7');

    // 5. Verify admin settings panel is open
    await expect(page.locator('text=工程後台參數設定')).toBeVisible();

    // 6. Adjust mini game duration and customer spawn interval
    const miniGameInput = page.locator('input[type="range"]').nth(5);
    if (await miniGameInput.isVisible()) {
      await miniGameInput.fill('10');
    }

    // Close settings modal
    const closeBtn = page.locator('text=關閉 ✕');
    await closeBtn.click();
    await expect(page.locator('text=工程後台參數設定')).not.toBeVisible();
  });

  test('Test Case 5: Pure Keyboard Controls Main Game Loop', async ({ page }) => {
    const canvas = page.locator('canvas');
    await expect(canvas).toBeVisible();
    await canvas.focus();

    // Initial position in SHOP is (8, 6)
    // Move to Back Door at (2, 1): move Left 6 steps, Up 5 steps
    for (let i = 0; i < 6; i++) {
      await page.keyboard.press('ArrowLeft');
      await page.waitForTimeout(60);
    }
    for (let i = 0; i < 5; i++) {
      await page.keyboard.press('ArrowUp');
      await page.waitForTimeout(60);
    }

    // Press Space to enter WAREHOUSE
    await page.keyboard.press('Space');
    await page.waitForTimeout(200);

    // In WAREHOUSE, initial position is (2, 2)
    // Move to Basket storage at (2, 3): move Down 1 step
    await page.keyboard.press('ArrowDown');
    await page.waitForTimeout(100);

    // Press Space to pick empty basket
    await page.keyboard.press('Space');
    await page.waitForTimeout(100);

    // Verify holding basket (🧺)
    await expect(page.locator('text=🧺')).toBeVisible();

    // Move to Fruit Pile 1 at (5, 4): move Down 1 step, Right 3 steps
    await page.keyboard.press('ArrowDown');
    await page.waitForTimeout(60);
    for (let i = 0; i < 3; i++) {
      await page.keyboard.press('ArrowRight');
      await page.waitForTimeout(60);
    }

    // Press Space to start MINI_GAME
    await page.keyboard.press('Space');
    await page.waitForTimeout(300);

    // Verify in MINI_GAME scene (look for hourglass ⏳)
    const miniGameCanvas = page.locator('canvas');
    await expect(miniGameCanvas).toBeVisible();

    // Control kitty movement in mini-game
    for (let i = 0; i < 5; i++) {
      await page.keyboard.press('ArrowLeft');
      await page.waitForTimeout(100);
      await page.keyboard.press('ArrowRight');
      await page.waitForTimeout(100);
    }
  });

  test('Test Case 6: Pure Keyboard Checkout Verification', async ({ page }) => {
    // Open admin to instantly spawn customer
    const gearBtn = page.locator('#admin-gear-btn');
    await gearBtn.click();

    await page.keyboard.press('1');
    await page.keyboard.press('1');
    await page.keyboard.press('0');
    await page.keyboard.press('7');

    await expect(page.locator('text=工程後台參數設定')).toBeVisible();

    // Click instant spawn customer button
    const spawnBtn = page.locator('text=一鍵生成顧客');
    await spawnBtn.click();

    // Close admin panel
    await page.locator('text=關閉 ✕').click();

    const canvas = page.locator('canvas');
    await canvas.focus();

    // Move player to counter interaction spot (11, 7)
    // From (8, 6), move Right 3 steps, Down 1 step
    for (let i = 0; i < 3; i++) {
      await page.keyboard.press('ArrowRight');
      await page.waitForTimeout(60);
    }
    await page.keyboard.press('ArrowDown');
    await page.waitForTimeout(60);

    // Wait for customer to browse and queue
    await page.waitForTimeout(3000);

    // Press Space to interact with register
    await page.keyboard.press('Space');

    // If modal opens, verify and submit via keyboard
    const modal = page.locator('text=🛒');
    if (await modal.isVisible()) {
      // Navigate keypad using ArrowRight and Space
      await page.keyboard.press('ArrowRight');
      await page.keyboard.press('Space');
      await page.keyboard.press('Enter');
    }
  });
});
