import {expect,test} from '@playwright/test';
import {readFile} from 'node:fs/promises';
test.beforeEach(async({page})=>{
  await page.addInitScript(()=>{
    const state={stopped:0};Object.assign(window,{voiceTest:state});
    Object.defineProperty(navigator,'mediaDevices',{value:{getUserMedia:async()=>({getTracks:()=>[{stop:()=>state.stopped++}]})},configurable:true});
    class Recorder{static isTypeSupported(){return true;}state='inactive';mimeType='audio/webm';ondataavailable:((e:{data:Blob})=>void)|null=null;onstop:(()=>void)|null=null;start(){this.state='recording';}stop(){this.state='inactive';this.ondataavailable?.({data:new Blob(['test audio'],{type:this.mimeType})});queueMicrotask(()=>this.onstop?.());}}
    Object.assign(window,{MediaRecorder:Recorder});
  });
});
test('dictation is reviewed before adding to the prompt and never submits modeling automatically',async({page},info)=>{
  let uploads=0,modelCalls=0;
  await page.route('**/api/speech',async r=>{uploads++;expect(r.request().headers()['x-elevenlabs-key']).toBe('test-voice-key');await r.fulfill({json:{text:'Make three books.'}});});
  await page.route('**/api/ai',async r=>{modelCalls++;await r.fulfill({json:{}});});
  await page.goto('/');await page.getByRole('button',{name:'Dictate',exact:true}).click();await page.getByLabel('ElevenLabs API key').fill('test-voice-key');await page.getByRole('button',{name:'Use voice key',exact:true}).click();
  const prompt=page.getByLabel('A little direction goes a long way.');await prompt.fill('On the table.');await page.getByRole('button',{name:'Dictate',exact:true}).click();await expect(page.getByRole('button',{name:'Connect AI',exact:true})).toBeDisabled();await page.getByRole('button',{name:/Stop & transcribe/}).click();
  await expect(page.getByLabel('Review transcript')).toHaveValue('Make three books.');await expect(prompt).toHaveValue('On the table.');await page.getByLabel('Review transcript').fill('Make four books.');await page.getByRole('button',{name:'Add to prompt',exact:true}).click();await expect(prompt).toHaveValue('On the table. Make four books.');expect(uploads).toBe(1);expect(modelCalls).toBe(0);
  expect(await page.evaluate(()=>(window as unknown as {voiceTest:{stopped:number}}).voiceTest.stopped)).toBe(1);
  await page.getByRole('button',{name:'Project',exact:true}).click();const event=page.waitForEvent('download');await page.getByRole('button',{name:'Download session',exact:true}).click();const d=await event;expect(await readFile((await d.path())!,'utf8')).not.toContain('test-voice-key');
  await page.setViewportSize({width:390,height:844});await expect(page.getByRole('button',{name:'Dictate',exact:true})).toBeInViewport();await page.screenshot({path:info.outputPath('speech-mobile.png')});
});
test('cancelled recording stops microphone tracks without uploading audio',async({page})=>{
  let uploads=0;await page.route('**/api/speech',async r=>{uploads++;await r.fulfill({json:{text:'unused'}});});
  await page.goto('/');await page.getByRole('button',{name:'Voice settings',exact:true}).click();await page.getByLabel('ElevenLabs API key').fill('test-voice-key');await page.getByRole('button',{name:'Use voice key',exact:true}).click();await page.getByRole('button',{name:'Dictate',exact:true}).click();await expect(page.getByRole('button',{name:/Stop & transcribe/})).toBeVisible();await page.getByRole('button',{name:'Cancel dictation',exact:true}).click();await expect(page.getByText('Dictation cancelled.',{exact:true})).toBeVisible();expect(uploads).toBe(0);expect(await page.evaluate(()=>(window as unknown as {voiceTest:{stopped:number}}).voiceTest.stopped)).toBe(1);
});

test('microphone denial is actionable and leaves the prompt unchanged',async({page})=>{
  await page.goto('/');await page.evaluate(()=>{Object.defineProperty(navigator,'mediaDevices',{value:{getUserMedia:async()=>{throw new DOMException('denied','NotAllowedError');}},configurable:true});});
  await page.getByRole('button',{name:'Voice settings',exact:true}).click();await page.getByLabel('ElevenLabs API key').fill('test-voice-key');await page.getByRole('button',{name:'Use voice key',exact:true}).click();await page.getByLabel('A little direction goes a long way.').fill('Keep my prompt.');await page.getByRole('button',{name:'Dictate',exact:true}).click();await expect(page.getByText(/Microphone access was denied/)).toBeVisible();await expect(page.getByLabel('A little direction goes a long way.')).toHaveValue('Keep my prompt.');await expect(page.getByRole('button',{name:'Dictate',exact:true})).toBeEnabled();
});
