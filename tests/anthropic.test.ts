import {expect,it,vi} from 'vitest';
import {runAI,validateEndpoint} from '../src/lib/api-server';
import {emptyProject} from '../src/lib/model';
const connection={endpoint:'https://api.anthropic.com/v1/messages',model:'claude-opus-5',key:'test-only-key'};
const intent={summary:'Book cover',actions:[{type:'primitive',kind:'box',name:'Cover',width:.2,length:.3,height:.01}]};
const request={mode:'interpret',connection,project:emptyProject(),instruction:'Make a book'};
it('uses native Anthropic headers, system prompt and text blocks for modeling',async()=>{
  const fetcher=vi.fn().mockResolvedValue(Response.json({stop_reason:'end_turn',content:[{type:'thinking',thinking:'not final'},{type:'text',text:JSON.stringify(intent)}]}));
  expect(await runAI(request,fetcher)).toEqual({intent});
  const options=fetcher.mock.calls[0][1],body=JSON.parse(options.body);
  expect(options.headers['x-api-key']).toBe(connection.key);expect(options.headers['anthropic-version']).toBe('2023-06-01');expect(options.headers.Authorization).toBeUndefined();
  expect(body.system).toBeTruthy();expect(body.messages.map((m:{role:string})=>m.role)).toEqual(['user']);expect(body.max_tokens).toBe(8192);
});
it('tests access with a native user message and rejects wrong Anthropic paths',async()=>{
  expect(()=>validateEndpoint('https://api.anthropic.com/v1/chat/completions')).toThrow('/v1/messages');
  const fetcher=vi.fn().mockResolvedValue(Response.json({stop_reason:'end_turn',content:[{type:'text',text:'connected'}]}));
  expect(await runAI({mode:'test',connection},fetcher)).toEqual({connected:true});expect(JSON.parse(fetcher.mock.calls[0][1].body).system).toBeUndefined();
});
it('retries token exhaustion but never accepts paused or tool-only turns',async()=>{
  const fetcher=vi.fn().mockResolvedValueOnce(Response.json({stop_reason:'max_tokens',content:[{type:'text',text:JSON.stringify(intent)}]})).mockResolvedValueOnce(Response.json({stop_reason:'end_turn',content:[{type:'text',text:JSON.stringify(intent)}]}));
  expect(await runAI(request,fetcher)).toEqual({intent});expect(fetcher.mock.calls.map(c=>JSON.parse(c[1].body).max_tokens)).toEqual([8192,16384]);
  for(const stop_reason of ['pause_turn','tool_use'])await expect(runAI(request,vi.fn().mockResolvedValue(Response.json({stop_reason,content:[{type:'text',text:JSON.stringify(intent)}]})))).rejects.toThrow('complete text answer');
});
