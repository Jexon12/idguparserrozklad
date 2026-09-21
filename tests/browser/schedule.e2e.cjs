const { test, expect } = require('@playwright/test');

test.beforeEach(async ({ page }) => {
    // Test storage is isolated by Playwright's fresh browser context.
    await page.goto('/index.html?demo=1');
    await expect(page.locator('.lesson-card').first()).toBeVisible();
});

test('minimum keeps daily pair, type and teacher without horizontal overflow', async ({ page }) => {
    await expect(page.locator('.schedule-pair-badge').first()).toBeVisible();
    await expect(page.locator('.lesson-type').first()).toBeVisible();
    await expect(page.locator('.lesson-teacher').first()).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
    expect(overflow).toBe(false);
});

test('history dialog opens from subject and Escape restores focus', async ({ page }) => {
    const trigger = page.locator('.lesson-history-trigger').filter({ visible: true }).first();
    await trigger.click();
    const dialog = page.getByRole('dialog', { name: 'Попередні заняття' });
    await expect(dialog).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(dialog).not.toBeVisible();
    await expect(trigger).toBeFocused();
});

test('expanded header keeps title and density controls separate', async ({ page }) => {
    await page.getByRole('button', { name: 'Деталі', exact: true }).click();
    const title = await page.locator('.app-title').boundingBox();
    const switcher = await page.locator('.mobile-view-switch').boundingBox();
    const overlaps = title.x < switcher.x + switcher.width && title.x + title.width > switcher.x &&
        title.y < switcher.y + switcher.height && title.y + title.height > switcher.y;
    expect(overlaps).toBe(false);
    await page.getByRole('button', { name: 'Мінімум', exact: true }).click();
    await expect(page.locator('.active-schedules')).toBeVisible();
});

test('text enlargement preserves card metadata', async ({ page }) => {
    await page.addStyleTag({ content: 'html { font-size: 200% !important; }' });
    await expect(page.locator('.lesson-teacher').first()).toBeVisible();
    await expect(page.locator('.schedule-pair-badge').first()).toBeVisible();
});
