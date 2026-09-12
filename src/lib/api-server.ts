import { z } from 'zod';
import { projectSchema, parseProject } from './model';
import { systemPrompt, parseIntentText, applyIntent } from './intent';

export const connectionSchema = z.object({ endpoint: z.string().url().max(500), model: z.string().trim().min(1).max(200), key: z.string().trim().min(1).max(4096) }).strict();
export type Connection = z.infer<typeof connectionSchema>;
export const requestSchema = z.object({
  mode: z.enum(['test', 'interpret']), connection: connectionSchema,
  instruction: z.string().trim().max(3000).optional(), project: projectSchema.optional(),
  selectedId: z.string().max(80).nullable().optional(), strokeId: z.string().max(80).nullable().optional(),
}).strict();
export const defaultHosts = ['api.ifm.ai', 'platform.ifm.ai', 'api.cerebras.ai', 'api.groq.com', 'openrouter.ai', 'api.together.xyz', 'api.together.ai'];
export function validateEndpoint(endpoint: string, extraHosts = '') {
  const url = new URL(endpoint);
  const hosts = [...defaultHosts, ...extraHosts.split(',').map(h => h.trim().toLowerCase()).filter(Boolean)];
  if (url.protocol !== 'https:' || url.username || url.password || url.hash || url.search || (url.port && url.port !== '443')) throw new Error('Use an HTTPS Chat Completions URL without credentials, query parameters, or a custom port.');
  if (!hosts.includes(url.hostname.toLowerCase()) || !url.hostname.includes('.') || /^[\d.]+$/.test(url.hostname) || url.hostname.includes(':') || /(?:^|\.)(?:localhost|local|internal|test)$/.test(url.hostname)) throw new Error('This API host is not enabled on this deployment. Use a supported provider or ask the deployment owner to enable your provider.');
  if (!url.pathname.endsWith('/chat/completions')) throw new Error('Enter the full Chat Completions endpoint, ending in /chat/completions.');
  return url;
}
export async function runAI(raw: unknown, fetcher: typeof fetch = fetch, extraHosts = '') {
  const body = requestSchema.parse(raw);
  const endpoint = validateEndpoint(body.connection.endpoint, extraHosts);
  if (/[\r\n]/.test(body.connection.key)) throw new Error('The API key contains a line break. Paste just the key.');
  let messages: { role: string; content: string }[];
  if (body.mode === 'test') messages = [{ role: 'user', content: 'Reply with the single word connected.' }];
  else {
    if (!body.project || !body.instruction) throw new Error('Add a sketch or select an object, then enter an instruction.');
    const project = parseProject(body.project);
    messages = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: JSON.stringify({ instruction: body.instruction, units: 'meters', selectedObjectId: body.selectedId, activeStrokeId: body.strokeId, project }) },
    ];
  }
  let response: Response;
  try {
    response = await fetcher(endpoint, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + body.connection.key },
      body: JSON.stringify({ model: body.connection.model, messages, max_tokens: body.mode === 'test' ? 512 : 4096, stream: false }),
      cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(45000),
    });
  } catch { throw new Error('The provider could not be reached within 45 seconds. Check the endpoint or try again.'); }
  if (!response.ok) {
    if (response.status === 401 || response.status === 403) throw new Error('The provider rejected this API key or model access. Check your credentials.');
    if (response.status === 429) throw new Error('The provider is rate limiting requests. Wait a moment and retry.');
    if (response.status === 402) throw new Error('The provider requires API credits for this request.');
    if (response.status === 404) throw new Error('The provider could not find that endpoint or model. Check both fields.');
    throw new Error('The provider could not complete this request (HTTP ' + response.status + '). Check that the model supports Chat Completions.');
  }
  const text = await readLimited(response, 512 * 1024);
  let data;
  try { data = JSON.parse(text); } catch { throw new Error('The provider returned an unreadable response. Check the API endpoint.'); }
  const content = data?.choices?.[0]?.message?.content;
  if (typeof content !== 'string' || !content.trim()) throw new Error('The model returned no final text. It may need a different token budget or API format.');
  if (body.mode === 'test') return { connected: true };
  const intent = parseIntentText(content);
  applyIntent(body.project!, intent);
  return { intent };
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
