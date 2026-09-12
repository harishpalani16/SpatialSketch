import { readLimited } from './api-server';
export const MAX_AUDIO_BYTES=3*1024*1024;
const audioTypes=new Set(['audio/webm','audio/mp4','audio/ogg','audio/wav','audio/mpeg']);
export async function transcribe(request:Request,fetcher:typeof fetch=fetch){
  const key=request.headers.get('x-elevenlabs-key')?.trim();
  if(!key||key.length>4096||/[\r\n]/.test(key))throw new Error('Enter your ElevenLabs API key in Voice settings.');
  const type=(request.headers.get('content-type')||'').split(';')[0];
  if(!audioTypes.has(type))throw new Error('This audio format is not supported. Try recording again.');
  if(Number(request.headers.get('content-length'))>MAX_AUDIO_BYTES)throw new Error('Recording is too large. Keep it under 3 MB.');
  if(!request.body)throw new Error('No audio was recorded.');
  const reader=request.body.getReader(),parts:Uint8Array<ArrayBuffer>[]=[];let size=0;
  try{while(true){const {value,done}=await reader.read();if(done)break;size+=value.length;if(size>MAX_AUDIO_BYTES){await reader.cancel();throw new Error('Recording is too large. Keep it under 3 MB.');}parts.push(new Uint8Array(value));}}finally{reader.releaseLock();}
  if(!size)throw new Error('No audio was recorded.');
  const data=new FormData();data.set('model_id','scribe_v2');data.set('tag_audio_events','false');data.set('timestamps_granularity','none');
  const extension=type==='audio/mp4'?'m4a':type.split('/')[1];data.set('file',new Blob(parts,{type}),'dictation.'+extension);
  let response:Response;
  try{response=await fetcher('https://api.elevenlabs.io/v1/speech-to-text',{method:'POST',headers:{'xi-api-key':key},body:data,cache:'no-store',redirect:'error',signal:AbortSignal.any([request.signal,AbortSignal.timeout(60000)])});}
  catch{throw new Error('Speech transcription did not finish. Check your connection and try again.');}
  if(!response.ok){
    if(response.status===401||response.status===403)throw new Error('ElevenLabs rejected the key or Speech to Text access. Check Voice settings.');
    if(response.status===402||response.status===429)throw new Error('ElevenLabs needs available credits or is rate limiting requests. Check your account and retry.');
    throw new Error('ElevenLabs could not transcribe this recording (HTTP '+response.status+'). Try a shorter recording.');
  }
  let result;try{result=JSON.parse(await readLimited(response,128*1024));}catch{throw new Error('ElevenLabs returned an unreadable transcript. Try again.');}
  if(typeof result.text!=='string'||!result.text.trim())throw new Error('ElevenLabs returned an empty transcript. Play the recording below to check the captured audio, or select another microphone in Voice settings.');
  if(result.text.length>12000)throw new Error('Transcript is too long for a design prompt. Try a shorter recording.');
  return {text:result.text.trim()};
}
