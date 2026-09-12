import {expect,it,vi} from 'vitest';
import {runAI,finalContent,modelingBudget} from '../src/lib/api-server';
import {emptyProject} from '../src/lib/model';
const connection={endpoint:'https://api.ifm.ai/v1/chat/completions',model:'test-thinking-model',key:'test-only-key'};
const intent={summary:'An editable book cover.',actions:[{type:'primitive',kind:'box',name:'Book cover',width:.2,length:.3,height:.005}]};
const request={mode:'interpret',connection,project:emptyProject(),instruction:'Make a book'};
it('recognizes a thinking model and retries a truncated answer once with more headroom',async()=>{
  const fetcher=vi.fn().mockResolvedValueOnce(Response.json({choices:[{finish_reason:'length',message:{reasoning_content:'test reasoning only'}}]})).mockResolvedValueOnce(Response.json({choices:[{finish_reason:'stop',message:{content:JSON.stringify(intent)}}]}));
  expect(modelingBudget(connection)).toBe(16384);expect(modelingBudget({...connection,model:'IFM/K2-Think-v2'})).toBe(32768);expect(await runAI(request,fetcher)).toEqual({intent});expect(fetcher).toHaveBeenCalledTimes(2);
  expect(fetcher.mock.calls.map(c=>JSON.parse(c[1].body).max_tokens)).toEqual([16384,32768]);expect(fetcher.mock.calls[0][1].signal).toBe(fetcher.mock.calls[1][1].signal);
  expect(JSON.stringify(fetcher.mock.calls[1][1].body)).not.toContain('test reasoning only');expect(request.project.objects).toEqual([]);
});
it('honors an explicit response cap and does not treat partial JSON as a complete answer',async()=>{
  const fetcher=vi.fn().mockResolvedValue(Response.json({choices:[{finish_reason:'length',message:{content:JSON.stringify(intent)}}]}));
  await expect(runAI({...request,connection:{...connection,maxTokens:4096}},fetcher)).rejects.toThrow(/4,096-token response budget/);expect(fetcher).toHaveBeenCalledTimes(1);
});
it('stops after the maximum automatic budget and never executes reasoning text',async()=>{
  const fetcher=vi.fn().mockImplementation(async()=>Response.json({choices:[{finish_reason:'length',message:{content:null,reasoning_content:JSON.stringify(intent)}}]}));
  await expect(runAI(request,fetcher)).rejects.toThrow(/32,768-token/);expect(fetcher).toHaveBeenCalledTimes(2);expect(request.project.objects).toEqual([]);
});
it('reads supported final text formats while discarding reasoning wrappers',()=>{
  expect(finalContent({message:{content:[{type:'text',text:JSON.stringify(intent)}]}},16384)).toBe(JSON.stringify(intent));
  expect(finalContent({message:{content:'<think>test reasoning</think>\n'+JSON.stringify(intent)}},16384)).toBe(JSON.stringify(intent));
  expect(()=>finalContent({message:{content:'<think>unfinished reasoning'}},16384)).toThrow(/no final answer/);
  expect(()=>finalContent({message:{content:null,reasoning_content:JSON.stringify(intent)}},16384)).toThrow(/no final answer/);
});
it('shows a bounded provider rejection reason without leaking the session key or retrying rejected requests',async()=>{
  const fetcher=vi.fn().mockResolvedValue(Response.json({error:{message:'Invalid token budget; Authorization: Bearer '+connection.key}},{status:400}));
  let message='';try{await runAI(request,fetcher);}catch(e){message=(e as Error).message;}
  expect(message).toContain('Invalid token budget');expect(message).toContain('HTTP 400');expect(message).not.toContain(connection.key);expect(fetcher).toHaveBeenCalledTimes(1);
});
