import {expect,test} from '@playwright/test';
import {readFile} from 'node:fs/promises';
test('manual token budget survives settings and reaches modeling requests without entering session exports',async({page})=>{
  await page.route('**/api/ai',async route=>{const body=route.request().postDataJSON();expect(body.connection.maxTokens).toBe(32768);await route.fulfill({json:body.mode==='test'?{connected:true}:{intent:{summary:'No changes for this connection check.',actions:[]}}});});
  await page.goto('/');await expect(page.getByTestId('model-canvas')).toBeVisible();await page.getByRole('button',{name:'Connect API',exact:true}).click();await page.getByLabel('Chat Completions endpoint').fill('https://api.ifm.ai/v1/chat/completions');await page.getByLabel('Model name',{exact:true}).fill('IFM/K2-Think-v2');await page.getByLabel('API key',{exact:true}).fill('test-only-key');await page.getByLabel('Response budget',{exact:true}).selectOption('32768');await page.getByRole('button',{name:'Test connection',exact:true}).click();await expect(page.getByRole('status').filter({hasText:'Connection works'})).toBeVisible();await page.getByRole('button',{name:'Use for this session'}).click();
  await page.getByLabel('A little direction goes a long way.').fill('make a stack of books');await page.getByRole('button',{name:'Ask AI',exact:true}).click();await expect(page.getByRole('status')).toContainText('No changes');
  await page.getByRole('button',{name:'AI connected',exact:true}).click();await expect(page.getByLabel('Response budget',{exact:true})).toHaveValue('32768');await page.getByRole('button',{name:'Close API settings',exact:true}).click();
  await page.getByRole('button',{name:'Project',exact:true}).click();const event=page.waitForEvent('download');await page.getByRole('button',{name:'Download session',exact:true}).click();const download=await event,text=await readFile((await download.path())!,'utf8');expect(text).not.toContain('test-only-key');expect(text).not.toContain('maxTokens');
});


test('provider dropdown selects Anthropic and sets the native endpoint',async({page})=>{
  await page.route('**/api/ai',async route=>{const body=route.request().postDataJSON();expect(body.connection.endpoint).toBe('https://api.anthropic.com/v1/messages');expect(body.connection.model).toBe('claude-opus-5');await route.fulfill({json:{connected:true}});});
  await page.goto('/');await page.getByRole('button',{name:'Connect API',exact:true}).click();await page.getByLabel('AI provider',{exact:true}).selectOption('anthropic');await page.getByLabel('Model name',{exact:true}).fill('claude-opus-5');await expect(page.getByLabel('Anthropic Messages endpoint')).toHaveValue('https://api.anthropic.com/v1/messages');await page.getByLabel('API key',{exact:true}).fill('test-only-key');await page.getByRole('button',{name:'Test connection',exact:true}).click();await expect(page.getByRole('status').filter({hasText:'Connection works'})).toBeVisible();await page.getByRole('button',{name:'Use for this session'}).click();await expect(page.getByRole('button',{name:'AI connected',exact:true})).toBeVisible();
});

test('switching providers fills each endpoint and clears the previous credentials',async({page})=>{
  await page.goto('/');await page.getByRole('button',{name:'Connect API',exact:true}).click();
  for(const [provider,endpoint] of [['ifm','https://api.ifm.ai/v1/chat/completions'],['openai','https://api.openai.com/v1/chat/completions'],['anthropic','https://api.anthropic.com/v1/messages']]){
    await page.getByLabel('AI provider',{exact:true}).selectOption(provider);await expect(page.locator('#api-endpoint')).toHaveValue(endpoint);await expect(page.getByLabel('API key',{exact:true})).toHaveValue('');await expect(page.getByLabel('Model name',{exact:true})).toHaveValue('');await page.getByLabel('API key',{exact:true}).fill('test-prior-key');await page.getByLabel('Model name',{exact:true}).fill('test-prior-model');
  }
});
