import { test, expect, type Page } from '@playwright/test';
async function code(page: Page, value: string) {
  await page.getByRole('textbox', { name: 'Python 代码编辑器' }).click();
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.insertText(value);
}
test('Python input, Unicode, errors, infinite loop stop and recovery', async ({ page }) => {
  await page.goto('/');
  await code(page, 'name = input("你叫什么？")\nprint("你好，" + name)');
  await page.getByRole('button', { name: '▶ 运行作品' }).click();
  const input = page.getByRole('textbox', { name: '程序输入' });
  await expect(input).toBeEnabled({ timeout: 60000 });
  await expect(page.getByLabel('运行输出')).toContainText('你叫什么？');
  await input.fill('小桃');
  await input.press('Enter');
  await expect(page.getByLabel('运行输出')).toContainText('你好，小桃');
  await expect(page.getByRole('status')).toHaveText('运行结束');
  await code(page, 'print(int("你好"))');
  await page.getByRole('button', { name: '▶ 运行作品' }).click();
  await expect(page.getByRole('alert')).toContainText('无法变成整数', { timeout: 60000 });
  await code(page, 'while True:\n    pass');
  await page.getByRole('button', { name: '▶ 运行作品' }).click();
  await expect(page.getByRole('status')).toContainText('正在运行', { timeout: 60000 });
  await page.getByRole('button', { name: '■ 停止' }).click();
  await expect(page.getByRole('status')).toContainText('已停止');
  await code(page, 'print("重新出发")');
  await page.getByRole('button', { name: '▶ 运行作品' }).click();
  await expect(page.getByLabel('运行输出')).toContainText('重新出发', { timeout: 60000 });
});
test('autosave, manual challenge progress, version restoration and export', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('textbox', { name: '作品名称' }).fill('我的星球游戏');
  await code(page, 'print("版本一")');
  await page.getByRole('button', { name: '▶ 运行作品' }).click();
  await expect(page.getByLabel('运行输出')).toContainText('版本一', { timeout: 60000 });
  await code(page, 'print("版本二")');
  await page.reload();
  await expect(page.getByRole('textbox', { name: '作品名称' })).toHaveValue('我的星球游戏');
  await expect(page.getByRole('textbox', { name: 'Python 代码编辑器' })).toContainText('版本二');
  await page.getByRole('button', { name: '↶ 版本记录' }).click();
  await page.getByRole('button', { name: '恢复', exact: true }).first().click();
  await expect(page.getByRole('textbox', { name: 'Python 代码编辑器' })).toContainText('版本一');
  await page.getByText('我来检查一下', { exact: true }).click();
  for (const checkbox of await page.getByRole('checkbox').all()) await checkbox.check();
  await page.getByRole('button', { name: '记录挑战完成' }).click();
  await page.reload();
  await expect(page.getByRole('navigation')).toContainText('✓');
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: '导出 .py' }).click();
  expect((await download).suggestedFilename()).toBe('我的作品.py');
});
test('starter game supports repeated input and victory', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '▶ 运行作品' }).click();
  const input = page.getByRole('textbox', { name: '程序输入' });
  let low = 1, high = 20;
  for (let i = 0; i < 5; i++) {
    await expect(input).toBeEnabled({ timeout: 60000 });
    const guess = Math.floor((low + high) / 2);
    await input.fill(String(guess));
    await input.press('Enter');
    await expect.poll(async () => { const text = await page.getByLabel('运行输出').textContent() || ''; return text.includes('猜中了') || text.split('你猜是多少？').length > i + 2; }).toBe(true);
    const output = await page.getByLabel('运行输出').textContent() || '';
    if (output.includes('猜中了')) break;
    if (output.lastIndexOf('猜小啦') > output.lastIndexOf('猜大啦')) low = guess + 1;
    else high = guess - 1;
  }
  await expect(page.getByLabel('运行输出')).toContainText('猜中了');
});
