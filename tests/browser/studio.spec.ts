import { expect, test, type Page } from '@playwright/test';

async function drawRectangle(page: Page) {
  await page.getByRole('button', { name: 'Rectangle', exact: true }).click();
  const box = await page.getByTestId('sketch-canvas').boundingBox();
  if (!box) throw new Error('No sketch surface');
  await page.mouse.move(box.x + box.width * .3, box.y + box.height * .35);
  await page.mouse.down(); await page.mouse.move(box.x + box.width * .68, box.y + box.height * .68, { steps: 16 }); await page.mouse.up();
}
test('draw, create, dimension, undo, export and reopen', async ({ page }, testInfo) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto('/'); await expect(page.getByTestId('model-canvas')).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('desktop-initial.png') });
  await page.getByRole('button', { name: 'Start a fresh study' }).click();
  await drawRectangle(page); await expect(page.getByRole('button', { name: 'Create form', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Create form', exact: true }).click();
  const height = page.getByRole('spinbutton', { name: 'Height', exact: true });
  await height.fill('12'); await height.press('Tab'); await expect(height).toHaveValue('12');
  await page.getByRole('button', { name: 'Undo', exact: true }).click(); await expect(height).toHaveValue('3.6');
  await page.getByRole('button', { name: 'Redo', exact: true }).click(); await expect(height).toHaveValue('12');
  await page.getByText('Profile size & position', { exact: true }).click();
  await page.getByRole('spinbutton', { name: 'Width', exact: true }).fill('10');
  await page.getByRole('spinbutton', { name: 'Width', exact: true }).press('Tab');
  await expect(page.getByRole('spinbutton', { name: 'Width', exact: true })).toHaveValue('10');
  await page.getByRole('button', { name: 'Project', exact: true }).click();
  const saved = page.waitForEvent('download'); await page.getByRole('button', { name: 'Download project', exact: true }).click();
  const download = await saved; const savedPath = testInfo.outputPath('study.json'); await download.saveAs(savedPath);
  await page.getByRole('button', { name: 'Start a fresh study' }).click();
  await page.locator('input[type=file]').first().setInputFiles(savedPath); await expect(page.getByRole('spinbutton', { name: 'Height', exact: true })).toHaveValue('12');
  await page.getByRole('button', { name: 'Project', exact: true }).click();
  const glb = page.waitForEvent('download'); await page.getByRole('button', { name: 'Export model · GLB' }).click();
  const exported = await glb; expect(exported.suggestedFilename()).toMatch(/\.glb$/);
  await exported.saveAs(testInfo.outputPath('model.glb'));
  const { readFile } = await import('node:fs/promises');
  expect((await readFile(testInfo.outputPath('model.glb'))).subarray(0, 4).toString()).toBe('glTF');
  await page.screenshot({ path: testInfo.outputPath('desktop-built.png') });
  expect(errors).toEqual([]);
});
test('an AI response cannot overwrite a newer manual edit', async ({ page }) => {
  let release: () => void = () => {};
  const gate = new Promise<void>(resolve => { release = resolve; });
  let started = false;
  await page.route('**/api/ai', async route => {
    started = true; await gate;
    await route.fulfill({ json: { intent: { summary: 'Change height', actions: [{ type: 'update', objectId: 'sample-mass', changes: { height: 20 } }] } } });
  });
  await page.goto('/'); await page.getByRole('button', { name: 'Connect API', exact: true }).click();
  await page.getByLabel('Chat Completions endpoint').fill('https://api.ifm.ai/v1/chat/completions');
  await page.getByLabel('Model name', { exact: true }).fill('test-model'); await page.getByLabel('API key', { exact: true }).fill('test-only-key');
  await page.getByRole('button', { name: 'Use for this session' }).click();
  await page.getByLabel('A little direction goes a long way.').fill('Make it taller'); await page.getByRole('button', { name: 'Ask AI', exact: true }).click();
  await expect.poll(() => started).toBe(true);
  await page.getByRole('spinbutton', { name: 'Height', exact: true }).fill('9'); await page.getByRole('spinbutton', { name: 'Height', exact: true }).press('Tab');
  release(); await expect(page.getByRole('status')).toContainText('study changed');
  await expect(page.getByRole('spinbutton', { name: 'Height', exact: true })).toHaveValue('9');
  await expect(page.getByRole('button', { name: 'Apply change', exact: true })).toHaveCount(0);
});
test('cancelled pen strokes are discarded and the next stroke works', async ({ page }) => {
  await page.goto('/'); await page.getByRole('button', { name: 'Start a fresh study' }).click();
  const canvas = page.getByTestId('sketch-canvas');
  await canvas.evaluate(element => {
    element.setPointerCapture = () => {};
    const r = element.getBoundingClientRect();
    const init = { pointerType: 'pen', pointerId: 7, button: 0, bubbles: true, clientX: r.x + 80, clientY: r.y + 80 };
    element.dispatchEvent(new PointerEvent('pointerdown', init));
    element.dispatchEvent(new PointerEvent('pointermove', { ...init, clientX: r.x + 140 }));
    element.dispatchEvent(new PointerEvent('pointercancel', init));
  });
  await expect(page.getByRole('status')).toContainText('Stroke interrupted');
  await expect(page.getByRole('button', { name: 'Create form', exact: true })).toBeDisabled();
  await drawRectangle(page); await expect(page.getByRole('button', { name: 'Create form', exact: true })).toBeEnabled();
});
test('session keys are cleared on refresh, excluded from exports, and AI requires apply', async ({ page }, testInfo) => {
  await page.route('**/api/ai', async route => {
    const data = route.request().postDataJSON();
    await route.fulfill({ json: data.mode === 'test' ? { connected: true } : { intent: { summary: 'Three floors at 3.6 meters each.', actions: [{ type: 'update', objectId: 'sample-mass', changes: { height: 10.8, floors: 3 } }] } } });
  });
  await page.goto('/'); await page.getByRole('button', { name: 'Connect API', exact: true }).click();
  await page.getByLabel('Chat Completions endpoint').fill('https://api.ifm.ai/v1/chat/completions');
  await page.getByLabel('Model name', { exact: true }).fill('test-model'); await page.getByLabel('API key', { exact: true }).fill('test-only-session-secret');
  await page.getByRole('button', { name: 'Test connection', exact: true }).click(); await expect(page.getByText('Connected successfully. Ready to interpret your sketches.')).toBeVisible();
  await page.getByRole('button', { name: 'Use for this session' }).click();
  await page.getByLabel('A little direction goes a long way.').fill('Make this three floors'); await page.getByRole('button', { name: 'Ask AI', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Apply change', exact: true })).toBeVisible();
  await expect(page.getByRole('spinbutton', { name: 'Height', exact: true })).toHaveValue('7.2');
  await page.getByRole('button', { name: 'Apply change', exact: true }).click(); await expect(page.getByRole('spinbutton', { name: 'Height', exact: true })).toHaveValue('10.8');
  expect(await page.evaluate(() => JSON.stringify({ local: { ...localStorage }, session: { ...sessionStorage }, cookies: document.cookie }))).not.toContain('test-only-session-secret');
  await page.getByRole('button', { name: 'Project', exact: true }).click();
  const downloadEvent = page.waitForEvent('download'); await page.getByRole('button', { name: 'Download project', exact: true }).click();
  const result = await downloadEvent; const location = testInfo.outputPath('no-secrets.json'); await result.saveAs(location);
  const { readFile } = await import('node:fs/promises'); expect(await readFile(location, 'utf8')).not.toMatch(/test-only-session-secret|endpoint|apiKey/);
  await page.reload(); await expect(page.getByRole('button', { name: 'Connect API', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Connect API', exact: true }).click(); await expect(page.getByLabel('API key', { exact: true })).toHaveValue('');
});
test('tablet pen input and responsive phone layout', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1024, height: 768 }); await page.goto('/');
  await page.getByRole('button', { name: 'Start a fresh study' }).click();
  const canvas = page.getByTestId('sketch-canvas'); const box = await canvas.boundingBox(); if (!box) throw new Error('No canvas');
  // Browser-dispatched pen events verify the pointer path; physical Pencil still needs a device check.
  const points = [[.3,.3],[.7,.3],[.7,.7],[.3,.7],[.3,.3]];
  await canvas.evaluate((element, { box, points }) => {
    // Synthetic pointers do not have a native capture target.
    element.setPointerCapture = () => {};
    const base = { bubbles: true, pointerId: 9, pointerType: 'pen', button: 0, pressure: .5 };
    points.forEach(([x, y], i) => element.dispatchEvent(new PointerEvent(i ? 'pointermove' : 'pointerdown', { ...base, buttons: 1, clientX: box.x + box.width * x, clientY: box.y + box.height * y })));
    element.dispatchEvent(new PointerEvent('pointerup', { ...base, buttons: 0 }));
  }, { box, points });
  await expect(page.getByRole('button', { name: 'Create form', exact: true })).toBeEnabled(); await page.getByRole('button', { name: 'Create form', exact: true }).click();
  await page.screenshot({ path: testInfo.outputPath('tablet.png') });
  await page.setViewportSize({ width: 390, height: 844 }); await page.reload();
  await expect(page.getByTestId('sketch-canvas')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('phone.png') });
});
