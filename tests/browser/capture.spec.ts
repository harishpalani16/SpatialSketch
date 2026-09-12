import {expect,test} from '@playwright/test';
test.use({launchOptions:{args:['--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream']},permissions:['microphone']});
test('native MediaRecorder captures audible audio and preserves playback after an empty transcript',async({page})=>{
  let bytes:Buffer|null=null;
  await page.route('**/api/speech',async r=>{bytes=r.request().postDataBuffer();await r.fulfill({status:400,json:{error:'ElevenLabs returned an empty transcript.'}});});
  await page.goto('/');await page.getByRole('button',{name:'Voice settings',exact:true}).click();await page.getByLabel('ElevenLabs API key').fill('test-voice-key');await page.getByRole('button',{name:'Use voice key',exact:true}).click();await page.getByRole('button',{name:'Dictate',exact:true}).click();await expect(page.getByLabel('Microphone input level')).toBeVisible();await page.waitForTimeout(3500);await page.getByRole('button',{name:/Stop & transcribe/}).click();await expect(page.getByText('ElevenLabs returned an empty transcript.',{exact:true})).toBeVisible();expect(bytes!.length).toBeGreaterThan(1000);
  const decoded=await page.getByLabel('Last microphone recording').evaluate(async(audio:HTMLAudioElement)=>{const context=new AudioContext();try{const buffer=await context.decodeAudioData(await(await fetch(audio.src)).arrayBuffer());const data=buffer.getChannelData(0);return {duration:buffer.duration,peak:data.reduce((peak,v)=>Math.max(peak,Math.abs(v)),0)};}finally{await context.close();}});
  expect(decoded.duration).toBeGreaterThan(2);expect(decoded.peak).toBeGreaterThan(.01);await expect(page.getByRole('button',{name:'Retry transcription',exact:true})).toBeEnabled();
  await page.getByRole('button',{name:'Voice settings',exact:true}).click();await expect(page.getByLabel('Microphone',{exact:true}).locator('option')).not.toHaveCount(1);
});
