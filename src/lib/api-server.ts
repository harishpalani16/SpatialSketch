import { z } from 'zod';
import { projectSchema, parseProject, frameSchema } from './model';
import { baseFrame } from './spatial';
import { systemPrompt, parseIntentText, applyIntent } from './intent';
import { sketchContext } from './ai-context';

export const connectionSchema = z.object({ endpoint: z.string().url().max(500), model: z.string().trim().min(1).max(200), key: z.string().trim().min(1).max(4096), maxTokens:z.number().int().min(1024).max(32768).optional() }).strict();
export type Connection = z.infer<typeof connectionSchema>;
export function modelingBudget(connection:Connection) {return connection.maxTokens ?? (/^IFM\/K2-Think-v2$/i.test(connection.model)?32768:/think|reason|deepseek-r1/i.test(connection.model)?16384:8192);}
class IncompleteCompletion extends Error {}
export function finalContent(choice: {finish_reason?:unknown;message?:{content?:unknown;reasoning_content?:unknown;reasoning?:unknown;refusal?:unknown}}|undefined, budget:number) {
  if(choice?.finish_reason==='content_filter'||choice?.message?.refusal)throw new Error('The provider declined this request. Try a different design instruction.');
  if(choice?.finish_reason==='length')throw new IncompleteCompletion('The model reached its '+budget.toLocaleString('en-US')+'-token response budget before finishing. Increase Response budget in Connect API or try a faster model. Your sketch is unchanged.');
  const raw=choice?.message?.content;
  let text=typeof raw==='string'?raw:Array.isArray(raw)?raw.filter((p):p is {type:'text';text:string}=>!!p&&p.type==='text'&&typeof p.text==='string').map(p=>p.text).join('\n'):'';
  // Some compatible providers wrap reasoning inside content. Only use the final answer after it.
  text=text.trim();if(text.startsWith('<think>')){const end=text.indexOf('</think>');text=end<0?'':text.slice(end+8).trim();}
  if(!text)throw new IncompleteCompletion('The model returned no final answer. Increase Response budget in Connect API or try a faster model. Your sketch is unchanged.');
  return text;
}
export const requestSchema = z.object({
  mode: z.enum(['test', 'interpret']), connection: connectionSchema,
  instruction: z.string().trim().max(3000).optional(), project: projectSchema.optional(),
  selectedId: z.string().max(80).nullable().optional(), strokeId: z.string().max(80).nullable().optional(),
  activeFrame: frameSchema.optional(),
  activeGroupId:z.string().max(80).nullable().optional(), selectedStrokeIds:z.array(z.string().max(80)).max(1000).optional(),
}).strict();
export const defaultHosts = ['api.openai.com', 'api.anthropic.com', 'api.ifm.ai', 'platform.ifm.ai', 'api.cerebras.ai', 'api.groq.com', 'openrouter.ai', 'api.together.xyz', 'api.together.ai'];
export function validateEndpoint(endpoint: string, extraHosts = '') {
  const url = new URL(endpoint);
  const hosts = [...defaultHosts, ...extraHosts.split(',').map(h => h.trim().toLowerCase()).filter(Boolean)];
  if (url.protocol !== 'https:' || url.username || url.password || url.hash || url.search || (url.port && url.port !== '443')) throw new Error('Use an HTTPS Chat Completions URL without credentials, query parameters, or a custom port.');
  if (!hosts.includes(url.hostname.toLowerCase()) || !url.hostname.includes('.') || /^[\d.]+$/.test(url.hostname) || url.hostname.includes(':') || /(?:^|\.)(?:localhost|local|internal|test)$/.test(url.hostname)) throw new Error('This API host is not enabled on this deployment. Use a supported provider or ask the deployment owner to enable your provider.');
  if(url.hostname==='api.anthropic.com') {
    if(url.pathname!=='/v1/messages')throw new Error('Anthropic uses https://api.anthropic.com/v1/messages. Choose Anthropic in Connect API to set the correct endpoint.');
  } else if (!url.pathname.endsWith('/chat/completions')) throw new Error('Enter the full Chat Completions endpoint, ending in /chat/completions.');
  return url;
}
export async function runAI(raw: unknown, fetcher: typeof fetch = fetch, extraHosts = '') {
  const body = requestSchema.parse(raw);
  const endpoint = validateEndpoint(body.connection.endpoint, extraHosts);
  const anthropic=endpoint.hostname==='api.anthropic.com';
  if (/[\r\n]/.test(body.connection.key)) throw new Error('The API key contains a line break. Paste just the key.');
  let messages: { role: string; content: string }[];
  if (body.mode === 'test') messages = [{ role: 'user', content: 'Reply with the single word connected.' }];
  else {
    if (!body.project || !body.instruction) throw new Error('Enter an instruction for your study.');
    const project = parseProject(body.project);
    messages = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: JSON.stringify({ instruction: body.instruction, units: 'meters', selectedObjectId: body.selectedId, activeStrokeId: body.strokeId, activeFrame: body.activeFrame ?? baseFrame(), sketchContext:sketchContext(project,body.activeGroupId,body.selectedStrokeIds,body.strokeId), project }) },
    ];
  }
  // One bounded repair shares the same deadline; invalid geometry never reaches the client preview.
  const timeout=body.mode==='test'?45000:120000;
  const deadline=AbortSignal.timeout(timeout);
  let budget=body.mode==='test'?512:modelingBudget(body.connection);
  async function complete() {
    let response: Response;
    try {
      response = await fetcher(endpoint, {
        method: 'POST', headers: anthropic?{ 'Content-Type':'application/json','x-api-key':body.connection.key,'anthropic-version':'2023-06-01' }:{ 'Content-Type': 'application/json', Authorization: 'Bearer ' + body.connection.key },
        body: JSON.stringify({ model: body.connection.model, messages:anthropic?messages.filter(m=>m.role!=='system'):messages, ...(anthropic&&messages.some(m=>m.role==='system')?{system:messages.filter(m=>m.role==='system').map(m=>m.content).join('\n')} : {}), ...(endpoint.hostname==='api.openai.com'?{max_completion_tokens:budget,store:false}:{max_tokens:budget}), stream: false }),
        cache: 'no-store', redirect: 'error', signal: deadline,
      });
    } catch { throw new Error('The provider did not finish within '+timeout/1000+' seconds. Try again or use a faster model. Your sketch is unchanged.'); }
    if (!response.ok) {
      if (response.status === 401 || response.status === 403) throw new Error('The provider rejected this API key or model access. Check your credentials.');
      if (response.status === 429) throw new Error('The provider is rate limiting requests. Wait a moment and retry.');
      if (response.status === 402) throw new Error('The provider requires API credits for this request.');
      if (response.status === 404) throw new Error('The provider could not find that endpoint or model. Check both fields.');
      if(response.status===400) {
        let detail='';
        try {
          const data=JSON.parse(await readLimited(response,16000));
          const message=data?.error?.message??data?.message??data?.detail;
          if(typeof message==='string')detail=message.replaceAll(body.connection.key,'[redacted]').replace(/Bearer\s+[^\s"',}]+/gi,'Bearer [redacted]').replace(/IFM-v1[_-][A-Za-z0-9_-]+/g,'[redacted]').replace(/[\r\n]+/g,' ').slice(0,300);
        }catch{/* Some gateways return HTML; do not forward those bodies. */}
        throw new Error('The provider rejected the modeling request (HTTP 400). '+(detail||'It supplied no readable reason. Check the model ID and Response budget, then retry.')+' Your sketch is unchanged.');
      }
      throw new Error('The provider could not complete this request (HTTP ' + response.status + '). Check the endpoint and model, then retry.');
    }
    const text = await readLimited(response, 2 * 1024 * 1024);
    let data;
    try { data = JSON.parse(text); } catch { throw new Error('The provider returned an unreadable response. Check the API endpoint.'); }
    if(anthropic){
      if(data?.stop_reason==='refusal')throw new Error('The provider declined this request. Try a different design instruction.');
      if(data?.stop_reason!=='end_turn'&&data?.stop_reason!=='max_tokens')throw new Error('Anthropic did not return a complete text answer. Your sketch is unchanged.');
      return finalContent({finish_reason:data.stop_reason==='max_tokens'?'length':'stop',message:{content:data.content}},budget);
    }
    return finalContent(data?.choices?.[0],budget);
  }
  for(let attempt=0;attempt<2;attempt++) {
    let content:string;
    try {content=await complete();}
    catch(error){
      if(error instanceof IncompleteCompletion&&attempt===0&&body.connection.maxTokens===undefined&&budget<32768){budget=body.mode==='test'?4096:Math.min(32768,budget*2);continue;}
      throw error;
    }
    if(body.mode==='test')return {connected:true};
    try {const intent=parseIntentText(content);applyIntent(body.project!,intent,body.activeFrame);return {intent};}
    catch(error) {
      const reason=error instanceof z.ZodError?'A component has invalid dimensions or frame axes.':error instanceof Error?error.message:'Invalid modeling proposal.';
      if(attempt===1)throw new Error('AI could not construct a valid proposal after correction. Your sketch is unchanged. '+reason);
      messages.push({role:'assistant',content},{role:'user',content:JSON.stringify({validationError:reason,instruction:'Repair the proposal and return complete JSON. Do not change the original design request. Crossing raw pen strokes are valid design evidence: use component to infer NEW simple profiles and separate parts while preserving source ink. Do not use a bounding box as a silent substitute, invent existing IDs, or bypass geometry validation. If the design cannot be represented, return no actions and explain the specific limitation.'})});
    }
  }
  throw new Error('AI did not produce a modeling proposal.');
}
export async function readLimited(message: Request | Response, limit: number) {
  if (Number(message.headers.get('content-length')) > limit) throw new Error('The request or response is too large. Use a smaller study.');
  if (!message.body) throw new Error('Empty request or response.');
  const reader = message.body.getReader();
  const parts: Uint8Array[] = []; let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read(); if (done) break;
      size += value.length;
      if (size > limit) { await reader.cancel(); throw new Error('The request or response is too large. Use a smaller study.'); }
      parts.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size); let offset = 0;
  for (const part of parts) { bytes.set(part, offset); offset += part.length; }
  return new TextDecoder().decode(bytes);
}
