const { test, expect } = require('@playwright/test');

test.beforeEach(async ({ page }) => {
    // Test storage is isolated by Playwright's fresh browser context.
    await page.goto('/index.html?demo=1');
    await expect(page.locator('.lesson-card').first()).toBeVisible();
});

test('minimum keeps subject, daily pair and short teacher without horizontal overflow', async ({ page }) => {
    await expect(page.locator('.schedule-pair-badge').first()).toBeVisible();
    await expect(page.locator('.lesson-history-trigger').first()).toBeVisible();
    await expect(page.locator('.campus-lesson').first()).toHaveClass(/kind-lecture/);
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

test('phone keeps time above full-width lessons', async ({ page }) => {
    if (page.viewportSize().width >= 768) return;
    const slot = page.locator('.schedule-slot').first();
    const time = await slot.locator('.schedule-slot-time').boundingBox();
    const lesson = await slot.locator('.lesson-card').first().boundingBox();
    expect(time.y + time.height).toBeLessThanOrEqual(lesson.y + 1);
    expect(lesson.width).toBeGreaterThan(page.viewportSize().width * 0.7);
});

test('week has shared pair rows and both density modes fit the viewport', async ({ page }) => {
    await page.getByRole('button', { name: 'Тиждень', exact: true }).click();
    await expect(page.locator('.campus-week-grid')).toBeVisible();
    await expect(page.locator('.campus-week-grid tbody tr')).toHaveCount(6);
    for (const mode of ['Мінімум', 'Деталі']) {
        await page.getByRole('button', { name: mode, exact: true }).click();
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
        expect(overflow).toBe(false);
        const wrappedMenus = await page.locator('.campus-card-top').evaluateAll(rows => rows.filter(row => row.scrollWidth > row.clientWidth + 1).length);
        expect(wrappedMenus).toBe(0);
    }
});

test('shared groups merge and real conflicts remain marked when a type is filtered out', async ({ page }) => {
    const base = {dayOffset:0,study_time:'2 пара',study_time_begin:'10:00',study_time_end:'11:20',discipline:'Робототехніка',study_type:'Лекція',employee:'Кожухар Жанна Вікторівна',contingent:'36У',cabinet:'512/к1'};
    await page.route('**/data/demo-schedule.json*', route => route.fulfill({json:{name:'Тестовий розклад',lessons:[base,{...base,contingent:'38У'},{...base,discipline:'Програмування',study_type:'Лабораторна',contingent:'32У'}]}}));
    await page.goto('/index.html?demo=1');
    await expect(page.locator('.campus-lesson')).toHaveCount(2);
    await expect(page.locator('.kind-lecture .campus-groups span')).toHaveCount(2);
    await expect(page.locator('.campus-conflict')).toHaveCount(2);
    await expect(page.locator('.campus-day-alert')).toHaveCount(1);
    await page.getByRole('button', {name:'Лекція',exact:true}).click();
    await expect(page.locator('.campus-lesson')).toHaveCount(1);
    await expect(page.locator('.campus-conflict')).toHaveCount(1);
    await page.locator('.campus-conflict-link').click();
    await expect(page.locator('.campus-warning')).toContainText('Викладач має два заняття одночасно');
});

test('a long consultation type and missing room keep the menu inside the card', async ({ page }) => {
    const base={dayOffset:0,study_time:'1 пара',study_time_begin:'08:30',study_time_end:'09:50',discipline:'Робототехніка',study_type:'Лекції',employee:'Кожухар Жанна Вікторівна',contingent:'36У',cabinet:'512/к1'};
    await page.route('**/data/demo-schedule.json*',route=>route.fulfill({json:{name:'Тестовий розклад',lessons:[base,{...base,study_time:'2 пара',study_time_begin:'10:00',study_time_end:'11:20',discipline:'Цифровий практикум',study_type:'Консультації (індивідуальні)',cabinet:''},{...base,study_time:'4 пара',study_time_begin:'13:10',study_time_end:'14:30'}]}}));
    await page.goto('/index.html?demo=1');
    await page.getByRole('button',{name:'Деталі',exact:true}).click();
    await expect(page.locator('.campus-lesson.kind-consult')).toBeVisible();
    for(const view of ['День','Тиждень']) {
        await page.getByRole('button',{name:view,exact:true}).click();
        const overflow=await page.locator('.campus-card-top,.campus-lesson').evaluateAll(els=>els.filter(el=>el.scrollWidth>el.clientWidth+1).length);
        expect(overflow).toBe(0);
    }
});
