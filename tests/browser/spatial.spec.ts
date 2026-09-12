import { expect, test, type Page } from '@playwright/test';
async function manualForm(page: Page) { if(!(await page.getByRole('button',{name:'New form',exact:true}).isVisible())) await page.getByText('Model tools',{exact:true}).click();await page.getByRole('button',{name:'New form',exact:true}).click(); }
async function example(page: Page) {await page.getByRole('button',{name:'Project',exact:true}).click();await page.getByRole('button',{name:'Load example forms',exact:true}).click();}
import { readFile } from 'node:fs/promises';
import { facadeSketch, facadeProposal } from '../fixtures/facade';

async function saveProject(page: Page) {
  await page.getByRole('button',{name:'Project',exact:true}).click();
  const event=page.waitForEvent('download'); await page.getByRole('button',{name:'Download session',exact:true}).click();
  const download=await event, path=await download.path(); return JSON.parse(await readFile(path!,'utf8'));
}
async function pen(page: Page, cancel=false) {
  await page.getByTestId('model-canvas').evaluate((element,cancel) => {
    element.setPointerCapture=()=>{};
    const r=element.getBoundingClientRect(), positions=[[.43,.45],[.58,.45],[.58,.6],[.43,.6],[.43,.45]];
    const base={pointerId:21,pointerType:'pen',button:0,buttons:1,bubbles:true,pressure:.5};
    for(let i=0;i<positions.length;i++) {
      const [x,y]=positions[i];element.dispatchEvent(new PointerEvent(i?'pointermove':'pointerdown',{...base,clientX:r.x+r.width*x,clientY:r.y+r.height*y}));
      // Palm contacts must never become an extra stroke or move the camera.
      if(i===1) element.dispatchEvent(new PointerEvent('pointerdown',{...base,pointerId:22,pointerType:'touch',clientX:r.x+10,clientY:r.y+10}));
    }
    element.dispatchEvent(new PointerEvent(cancel?'pointercancel':'pointerup',{...base,buttons:0,clientX:r.x+r.width*.43,clientY:r.y+r.height*.45}));
    element.dispatchEvent(new PointerEvent('pointerup',{...base,pointerId:22,pointerType:'touch',buttons:0}));
  },cancel);
}
test('Pencil draws in an angled 3D frame; orbit preserves ink; model and project round-trip',async({page},info)=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('/'); await expect(page.getByTestId('model-canvas')).toBeVisible();
  await page.getByRole('button',{name:'New empty session'}).click();
  await page.getByRole('button',{name:'View plane',exact:true}).click();
  await pen(page,true); await expect(page.getByRole('status')).toContainText('Stroke interrupted');
  expect((await saveProject(page)).strokes).toHaveLength(0);
  await pen(page); await manualForm(page); await expect(page.getByRole('button',{name:'Create form',exact:true})).toBeEnabled();
  const before=await saveProject(page); expect(before.strokes).toHaveLength(1);expect(before.strokes[0].plane).toBe('custom');
  const f=before.strokes[0].frame;expect(f.u.some((v:number)=>Math.abs(v)>.01&&Math.abs(v)<.99)).toBe(true);
  await page.getByRole('button',{name:'Create form',exact:true}).click();
  await page.getByRole('button',{name:'Orbit / select',exact:true}).click();
  const r=(await page.getByTestId('model-canvas').boundingBox())!;
  await page.mouse.move(r.x+r.width*.65,r.y+r.height*.5);await page.mouse.down();await page.mouse.move(r.x+r.width*.8,r.y+r.height*.6,{steps:12});await page.mouse.up();
  const after=await saveProject(page);expect(after.strokes).toEqual(before.strokes);expect(after.objects[0].frame).toEqual(f);
  await page.locator('input[type=file]').first().setInputFiles({name:'spatial.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(after))});
  expect((await saveProject(page)).objects).toEqual(after.objects);
  await page.screenshot({path:info.outputPath('angled-sketch.png')});expect(errors).toEqual([]);
});
test('pick a model face, draw there, and change the next plane without moving previous ink',async({page},info)=>{
  await page.goto('/'); await expect(page.getByTestId('model-canvas')).toBeVisible();
  const project={version:2,name:'Face drawing',strokes:[],objects:[{id:'host',name:'Host box',kind:'box',plane:'ground',offset:0,height:4,thickness:.2,floors:1,color:'#c3c9aa',profile:[{x:-3,y:-3},{x:3,y:-3},{x:3,y:3},{x:-3,y:3}]}]};
  await page.locator('input[type=file]').first().setInputFiles({name:'host.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(project))});
  await page.getByRole('button',{name:'Fit model',exact:true}).click();
  await page.getByRole('button',{name:'Pick face',exact:true}).click();
  const canvas=page.getByTestId('model-canvas');await canvas.click({position:{x:(await canvas.boundingBox())!.width*.5,y:(await canvas.boundingBox())!.height*.5}});
  await expect(page.getByRole('status')).toContainText('Face plane placed');
  await pen(page);const before=await saveProject(page);expect(before.strokes[0].frame.hostObjectId).toBe('host');
  await page.getByText('Plane settings',{exact:true}).click();
  const tilt=page.getByRole('spinbutton',{name:'Plane rotation X',exact:true});await tilt.fill('35');await tilt.press('Tab');
  const depth=page.getByRole('spinbutton',{name:'Plane Y',exact:true});await depth.fill('2');await depth.press('Tab');
  await page.getByText('Plane settings',{exact:true}).click();
  await pen(page);const after=await saveProject(page);expect(after.strokes).toHaveLength(2);expect(after.strokes[0]).toEqual(before.strokes[0]);expect(after.strokes[1].frame).not.toEqual(before.strokes[0].frame);
  await page.screenshot({path:info.outputPath('face-and-tilted-plane.png')});
});
test('AI receives the active frame, previews cleaned ink, and builds editable furniture only after apply',async({page},info)=>{
  let calls=0;
  await page.route('**/api/ai',async route=>{
    const body=route.request().postDataJSON();expect(body.activeFrame).toHaveProperty('u');calls++;
    await route.fulfill({json:{intent:calls===1?{summary:'Square the sketch and preserve its outline.',actions:[{type:'refine',target:'stroke',id:body.strokeId,mode:'orthogonal'}]}:{summary:'Build a 2 by 1 meter table, 0.75 meters high, at this plane origin.',actions:[{type:'primitive',kind:'table',name:'Dining table',width:2,length:1,height:.75}]}}});
  });
  await page.goto('/'); await expect(page.getByTestId('model-canvas')).toBeVisible();await page.getByRole('button',{name:'New empty session'}).click();await page.getByRole('button',{name:'View plane',exact:true}).click();await pen(page);
  await page.getByRole('button',{name:'Connect API',exact:true}).click();await page.getByLabel('Chat Completions endpoint').fill('https://api.ifm.ai/v1/chat/completions');await page.getByLabel('Model name',{exact:true}).fill('test-model');await page.getByLabel('API key',{exact:true}).fill('test-only-key');await page.getByRole('button',{name:'Use for this session'}).click();
  await page.getByLabel('A little direction goes a long way.').fill('Straighten this sketch');await page.getByRole('button',{name:'Ask AI',exact:true}).click();await expect(page.getByRole('button',{name:'Apply change',exact:true})).toBeVisible();await page.getByRole('button',{name:'Apply change',exact:true}).click();
  await page.getByRole('button',{name:'Ground',exact:true}).click();await page.getByLabel('A little direction goes a long way.').fill('Build a table');await page.getByRole('button',{name:'Ask AI',exact:true}).click();await expect(page.getByRole('button',{name:'Apply change',exact:true})).toBeVisible();expect((await saveProject(page)).objects).toHaveLength(0);
  await page.getByRole('button',{name:'Apply change',exact:true}).click();const project=await saveProject(page);expect(project.objects[0].kind).toBe('table');
  await page.getByRole('button',{name:'Fit model',exact:true}).click();await page.screenshot({path:info.outputPath('ai-table.png')});
});
test('overlapping spatial sketch becomes an editable facade assembly after review, retaining the original ink',async({page},info)=>{
  const source=facadeSketch(),errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/api/ai',async route=>{const body=route.request().postDataJSON();expect(body.activeGroupId).toBe('sketch-1');expect(body.selectedStrokeIds).toHaveLength(2);await route.fulfill({json:{intent:facadeProposal}});});
  await page.goto('/');await expect(page.getByTestId('model-canvas')).toBeVisible();await page.getByTestId('session-file').setInputFiles({name:'facade.spatial.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(source))});await expect(page.getByRole('status')).toContainText('Session opened');
  await page.getByRole('button',{name:'Open sketch Sketch 1',exact:true}).click();
  await page.getByRole('button',{name:'Connect API',exact:true}).click();await page.getByLabel('Chat Completions endpoint').fill('https://api.ifm.ai/v1/chat/completions');await page.getByLabel('Model name',{exact:true}).fill('test-model');await page.getByLabel('API key',{exact:true}).fill('test-only-key');await page.getByRole('button',{name:'Use for this session'}).click();
  await page.getByLabel('A little direction goes a long way.').fill('make a facade edge detail');await page.getByRole('button',{name:'Ask AI',exact:true}).click();await expect(page.getByRole('button',{name:'Apply changes',exact:true})).toBeVisible();
  expect((await saveProject(page)).objects).toHaveLength(0);await page.getByRole('button',{name:'Apply changes',exact:true}).click();const result=await saveProject(page);expect(result.objects).toHaveLength(3);expect(result.strokes).toEqual(source.strokes);
  await page.getByRole('button',{name:'Fit model',exact:true}).click();await page.screenshot({path:info.outputPath('facade-interpretation.png')});
  const height=page.getByRole('spinbutton',{name:'Height',exact:true});await height.fill('0.006');await height.press('Tab');expect((await saveProject(page)).objects[2].height).toBe(.006);
  await page.getByRole('button',{name:'Undo',exact:true}).click();await page.getByRole('button',{name:'Undo',exact:true}).click();const undone=await saveProject(page);expect(undone.objects).toHaveLength(0);expect(undone.strokes).toEqual(source.strokes);expect(errors).toEqual([]);
});
