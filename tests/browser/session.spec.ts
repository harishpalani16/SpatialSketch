import {expect,test,type Page} from '@playwright/test';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {join,dirname} from 'node:path';
import {unzipSync,strFromU8} from 'three/addons/libs/fflate.module.js';
import {glbFixture,gltfFixture,objFixture,fbxFixture} from './import-fixtures';
async function ready(page:Page){await page.goto('/');await expect(page.getByTestId('model-canvas')).toBeVisible();}
async function draw(page:Page){await page.getByRole('button',{name:'View plane',exact:true}).click();await page.getByRole('button',{name:'Rectangle',exact:true}).click();const r=(await page.getByTestId('model-canvas').boundingBox())!;await page.mouse.move(r.x+r.width*.4,r.y+r.height*.4);await page.mouse.down();await page.mouse.move(r.x+r.width*.6,r.y+r.height*.6,{steps:12});await page.mouse.up();}
async function saved(page:Page){await page.getByRole('button',{name:'Project',exact:true}).click();const event=page.waitForEvent('download');await page.getByRole('button',{name:'Download session',exact:true}).click();const download=await event,bytes=await readFile((await download.path())!);return {project:download.suggestedFilename().endsWith('.zip')?JSON.parse(strFromU8(unzipSync(bytes)['session.json'])):JSON.parse(bytes.toString()),bytes,name:download.suggestedFilename()};}
test('organize a session, transform a complete sketch, delete selected ink and undo',async({page},info)=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));await ready(page);await draw(page);expect((await saved(page)).project.objects).toHaveLength(0);
  await page.getByLabel('Sketch name',{exact:true}).fill('Chair concept');await page.getByRole('button',{name:'Finish & next sketch'}).click();await draw(page);
  let p=(await saved(page)).project;expect(p.groups).toHaveLength(2);expect(p.strokes).toHaveLength(2);expect(p.groups[0].status).toBe('ready');
  await page.getByRole('button',{name:'Open sketch Chair concept',exact:true}).click();await page.getByText('Precise transform',{exact:true}).click();const move=page.getByRole('spinbutton',{name:'Move X',exact:true});await move.fill('5');await move.press('Tab');await page.getByRole('button',{name:'Apply transform',exact:true}).click();
  const changed=(await saved(page)).project;expect(changed.strokes[0].frame.origin[0]-p.strokes[0].frame.origin[0]).toBeCloseTo(5);expect(changed.strokes[1]).toEqual(p.strokes[1]);
  await page.getByRole('button',{name:'Lock Chair concept',exact:true}).click();await expect(page.getByRole('button',{name:'Delete selected ink',exact:true})).toBeDisabled();await page.getByRole('button',{name:'Unlock Chair concept',exact:true}).click();
  await page.getByRole('button',{name:'Delete selected ink',exact:true}).click();expect((await saved(page)).project.strokes).toHaveLength(1);await page.getByRole('button',{name:'Undo',exact:true}).click();expect((await saved(page)).project.strokes).toHaveLength(2);
  await page.getByRole('button',{name:'Hide Chair concept',exact:true}).click();expect((await saved(page)).project.groups[0].visible).toBe(false);await page.getByRole('button',{name:'Show Chair concept',exact:true}).click();
  await page.screenshot({path:info.outputPath('organized-sketches.png')});expect(errors).toEqual([]);
});
test('plane position, rotation, size and drag handles are undoable and leave previous ink fixed',async({page},info)=>{
  await ready(page);await draw(page);const before=(await saved(page)).project;
  await page.getByText('Plane settings',{exact:true}).click();const x=page.getByRole('spinbutton',{name:'Plane X',exact:true});await x.fill('3');await x.press('Tab');const rotate=page.getByRole('spinbutton',{name:'Plane rotation Z',exact:true});await rotate.fill('35');await rotate.press('Tab');const width=page.getByRole('spinbutton',{name:'Grid width',exact:true});await width.fill('12');await width.press('Tab');
  await page.getByText('Plane settings',{exact:true}).click();const changed=(await saved(page)).project;expect(changed.strokes).toEqual(before.strokes);expect(changed.workplane.frame.origin[0]).toBe(3);expect(changed.workplane.width).toBe(12);
  await page.getByRole('button',{name:'Ground',exact:true}).click();await page.getByRole('button',{name:'Fit model',exact:true}).click();await page.getByText('Plane settings',{exact:true}).click();await page.getByRole('button',{name:'Move plane',exact:true}).click();await page.getByText('Plane settings',{exact:true}).click();
  // The plane is at world origin. Fit includes the existing ink, so record a separate empty session for the handle test.
  await page.getByRole('button',{name:'New empty session',exact:true}).click();await page.getByText('Plane settings',{exact:true}).click();await page.getByRole('button',{name:'Move plane',exact:true}).click();await page.getByText('Plane settings',{exact:true}).click();
  const r=(await page.getByTestId('model-canvas').boundingBox())!;await page.mouse.move(r.x+r.width/2,r.y+r.height/2-55);await page.mouse.down();await page.mouse.move(r.x+r.width/2,r.y+r.height/2-100,{steps:14});await page.mouse.up();
  const moved=(await saved(page)).project;expect(moved.workplane.frame.origin[1]).toBeGreaterThan(.01);await page.getByRole('button',{name:'Undo',exact:true}).click();expect((await saved(page)).project.workplane.frame.origin).toEqual([0,0,0]);await page.screenshot({path:info.outputPath('plane-handles.png')});
});
for(const [format,files] of [['GLB',[glbFixture()]],['glTF',gltfFixture()],['OBJ',objFixture()],['FBX',[fbxFixture()]]] as const)test('import '+format+' geometry with correct units and pick its face',async({page},info)=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));await ready(page);await page.getByTestId('geometry-file').setInputFiles([...files]);await expect(page.getByRole('status')).toContainText('imported.',{timeout:30000});
  const output=await saved(page);expect(output.project.references).toHaveLength(1);expect(output.project.references[0].unitScale).toBe(1);expect(output.name).toMatch(/\.spatial.zip$/);
  await page.getByRole('button',{name:'Pick face',exact:true}).click();const r=(await page.getByTestId('model-canvas').boundingBox())!;await page.mouse.click(r.x+r.width/2,r.y+r.height/2);await expect(page.getByRole('status')).toContainText('Face plane placed');
  await page.screenshot({path:info.outputPath(format+'-import.png')});expect(errors).toEqual([]);
});
test('session package restores geometry and ink, and imported models can be transformed and removed',async({page},info)=>{
  await ready(page);await page.getByTestId('geometry-file').setInputFiles(glbFixture());await expect(page.getByRole('status')).toContainText('imported.',{timeout:30000});await page.getByText('Precise transform',{exact:true}).click();const pos=page.getByRole('spinbutton',{name:'Position X',exact:true});await pos.fill('4');await pos.press('Tab');await page.getByRole('button',{name:'Apply transform',exact:true}).click();
  await draw(page);const output=await saved(page);expect(output.project.references[0].transform.position[0]).toBe(4);expect(output.project.strokes).toHaveLength(1);
  await page.getByRole('button',{name:'New empty session',exact:true}).click();await page.getByTestId('session-file').setInputFiles({name:output.name,mimeType:'application/zip',buffer:output.bytes});await expect(page.getByRole('status')).toContainText('Session opened',{timeout:30000});
  const reopened=await saved(page);expect(reopened.project.strokes).toEqual(output.project.strokes);expect(reopened.project.references[0].transform.position[0]).toBe(4);
  await page.getByRole('button',{name:'Imports',exact:true}).click();await page.getByRole('button',{name:'Remove imported model',exact:true}).click();expect((await saved(page)).project.references).toHaveLength(0);await page.getByRole('button',{name:'Undo',exact:true}).click();expect((await saved(page)).project.references).toHaveLength(1);await page.screenshot({path:info.outputPath('interior-and-sketch.png')});
});
test('missing companion files report a clear error and do not change the session',async({page})=>{
  await ready(page);await page.getByTestId('geometry-file').setInputFiles(gltfFixture()[0]);await expect(page.getByRole('status')).toContainText('Missing model resource',{timeout:30000});expect((await saved(page)).project.references).toHaveLength(0);
});
test('canceling a plane handle drag restores its state and a subsequent drag works',async({page})=>{
  await ready(page);await page.getByText('Plane settings',{exact:true}).click();await page.getByRole('button',{name:'Move plane',exact:true}).click();await page.getByText('Plane settings',{exact:true}).click();
  const canvas=page.getByTestId('model-canvas'),r=(await canvas.boundingBox())!;
  await page.mouse.move(r.x+r.width/2,r.y+r.height/2-55);await page.mouse.down();await page.mouse.move(r.x+r.width/2,r.y+r.height/2-100,{steps:12});
  await canvas.dispatchEvent('pointercancel',{pointerId:1,pointerType:'mouse',button:0,bubbles:true});await page.mouse.up();await expect(page.getByRole('status')).toContainText('Transform interrupted');expect((await saved(page)).project.workplane.frame.origin).toEqual([0,0,0]);
  await page.mouse.move(r.x+r.width/2,r.y+r.height/2-55);await page.mouse.down();await page.mouse.move(r.x+r.width/2,r.y+r.height/2-100,{steps:12});await page.mouse.up();expect((await saved(page)).project.workplane.frame.origin[1]).toBeGreaterThan(.01);
});
test('an OBJ folder resolves nested material textures even when filenames repeat',async({page},info)=>{
  const folder=info.outputPath('model-folder'),model=objFixture()[0];
  const files=[['interior.obj',Buffer.from(model.buffer.toString().replace('interior.mtl','materials/palette.mtl'))],['materials/palette.mtl',Buffer.from('newmtl plaster\nKd 1 1 1\nmap_Kd b/wood.png\n')],['materials/a/wood.png',Buffer.from('unused texture with the same name')],['materials/b/wood.png',Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a2uoAAAAASUVORK5CYII=','base64')]] as const;
  for(const [name,bytes] of files){const path=join(folder,name);await mkdir(dirname(path),{recursive:true});await writeFile(path,bytes);}
  await ready(page);await page.getByTestId('geometry-folder').setInputFiles(folder);await expect(page.getByRole('status')).toContainText('imported.',{timeout:30000});
  const output=await saved(page),entries=unzipSync(output.bytes);expect(output.project.references).toHaveLength(1);expect(Object.keys(entries).filter(k=>/assets\/[^/]+\/\d+$/.test(k))).toHaveLength(4);
});
