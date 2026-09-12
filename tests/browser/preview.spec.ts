import {expect,test} from '@playwright/test';
import {readFile} from 'node:fs/promises';
import {glbFixture} from './import-fixtures';
test.use({deviceScaleFactor:2});
test('shaded mode is lighter, keeps imports pickable, and exports original materials',async({page},info)=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('/');const canvas=page.getByTestId('model-canvas');await expect(canvas).toBeVisible();
  await expect(page.getByRole('button',{name:'Shaded',exact:true})).toHaveAttribute('aria-pressed','true');
  await page.getByTestId('geometry-file').setInputFiles(glbFixture());await expect(page.getByRole('status')).toContainText('imported.');
  const shadedWidth=await canvas.evaluate((c:HTMLCanvasElement)=>c.width);
  await page.getByRole('button',{name:'Materials',exact:true}).click();await expect(canvas).toHaveAttribute('data-preview-mode','materials');expect(await canvas.evaluate((c:HTMLCanvasElement)=>c.width)).toBeGreaterThan(shadedWidth*1.5);
  await page.getByRole('button',{name:'Shaded',exact:true}).click();await expect(canvas).toHaveAttribute('data-preview-mode','shaded');
  await page.getByRole('button',{name:'Pick face',exact:true}).click();const r=(await canvas.boundingBox())!;await page.mouse.click(r.x+r.width/2,r.y+r.height/2);await expect(page.getByRole('status')).toContainText('Face plane placed');
  await page.getByRole('button',{name:'Project',exact:true}).click();const event=page.waitForEvent('download');await page.getByRole('button',{name:'Export model · GLB',exact:true}).click();const download=await event,bytes=await readFile((await download.path())!);const json=JSON.parse(bytes.subarray(20,20+bytes.readUInt32LE(12)).toString());
  expect(json.materials[0].pbrMetallicRoughness.baseColorFactor.slice(0,3)).toEqual([.6,.7,.5]);
  await page.screenshot({path:info.outputPath('shaded-import.png')});await page.setViewportSize({width:390,height:844});await expect(page.getByRole('button',{name:'Materials',exact:true})).toBeInViewport();expect(errors).toEqual([]);
});
