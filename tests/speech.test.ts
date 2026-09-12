import {expect,it,vi} from 'vitest';
import {transcribe,MAX_AUDIO_BYTES} from '../src/lib/speech-server';
import {isSameOrigin} from '../src/lib/http';
import {runAI} from '../src/lib/api-server';
const audio=()=>new Request('http://localhost/api/speech',{method:'POST',headers:{'content-type':'audio/mp4','x-elevenlabs-key':'test-only-key'},body:new Uint8Array([1,2,3])});
it('sends only audio and the speech key to the fixed ElevenLabs endpoint',async()=>{
  const fetcher=vi.fn().mockResolvedValue(Response.json({text:'Make a stack of books.'}));
  expect(await transcribe(audio(),fetcher)).toEqual({text:'Make a stack of books.'});
  const [url,options]=fetcher.mock.calls[0];expect(url).toBe('https://api.elevenlabs.io/v1/speech-to-text');expect(options.headers).toEqual({'xi-api-key':'test-only-key'});expect(options.redirect).toBe('error');
  expect(options.body.get('model_id')).toBe('scribe_v2');expect(options.body.get('file').size).toBe(3);expect(options.body.get('file').type).toBe('audio/mp4');expect(options.body.get('key')).toBeNull();
});
it('rejects empty, oversized and unsupported audio before provider upload',async()=>{
  const fetcher=vi.fn();
  for(const [body,type,message] of [[new Uint8Array(),'audio/mp4','No audio'],[new Uint8Array(MAX_AUDIO_BYTES+1),'audio/webm','too large'],['text','text/plain','format']] as const){await expect(transcribe(new Request('http://localhost/api/speech',{method:'POST',headers:{'content-type':type,'x-elevenlabs-key':'test'},body}),fetcher)).rejects.toThrow(message);}
  expect(fetcher).not.toHaveBeenCalled();
});
it('keeps provider errors and keys out of transcription output',async()=>{
  await expect(transcribe(audio(),vi.fn().mockResolvedValue(Response.json({error:'secret'}, {status:401})))).rejects.toThrow('rejected the key');
  await expect(transcribe(audio(),vi.fn().mockResolvedValue(Response.json({text:''})))).rejects.toThrow('No speech');
  expect(isSameOrigin(new Request('http://localhost/api/speech',{headers:{origin:'https://other.example'}}))).toBe(false);
});
it('uses the current OpenAI completion budget field without enabling stored completions',async()=>{
  const fetcher=vi.fn().mockResolvedValue(Response.json({choices:[{finish_reason:'stop',message:{content:'connected'}}]}));
  await runAI({mode:'test',connection:{endpoint:'https://api.openai.com/v1/chat/completions',model:'test-model',key:'test-only-key'}},fetcher);
  const body=JSON.parse(fetcher.mock.calls[0][1].body);expect(body.max_completion_tokens).toBe(512);expect(body.max_tokens).toBeUndefined();expect(body.store).toBe(false);
});
