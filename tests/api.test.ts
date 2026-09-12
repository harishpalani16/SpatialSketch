import { describe, expect, it, vi } from 'vitest';
import { readLimited, runAI, validateEndpoint } from '../src/lib/api-server';
import { sampleProject } from '../src/lib/model';
import { POST } from '../src/app/api/ai/route';

const connection = { endpoint: 'https://api.ifm.ai/v1/chat/completions', model: 'test-model', key: 'test-only-not-a-real-key' };
describe('session API proxy', () => {
  it('rejects arbitrary destinations, private hosts, URL credentials, and redirect paths', () => {
    for (const url of ['http://api.ifm.ai/v1/chat/completions', 'https://127.0.0.1/v1/chat/completions', 'https://evil.example/v1/chat/completions', 'https://user:pass@api.ifm.ai/v1/chat/completions', 'https://api.ifm.ai/v1/chat/completions?key=secret', 'https://api.ifm.ai/v1/models']) expect(() => validateEndpoint(url)).toThrow();
    expect(validateEndpoint(connection.endpoint).hostname).toBe('api.ifm.ai');
  });
  it('tests the connection without returning the key or provider text', async () => {
    const fetcher = vi.fn().mockResolvedValue(Response.json({ choices: [{ message: { content: 'connected' } }] }));
    expect(await runAI({ connection, mode: 'test' }, fetcher)).toEqual({ connected: true });
    const options = fetcher.mock.calls[0][1];
    expect(options.redirect).toBe('error'); expect(options.cache).toBe('no-store');
    expect(options.headers.Authorization).toBe('Bearer ' + connection.key);
    expect(JSON.parse(options.body).messages).toHaveLength(1);
  });
  it('returns only a validated proposal and never echoes provider errors containing secrets', async () => {
    const intent = { summary: 'Increase the height.', actions: [{ type: 'update', objectId: 'sample-mass', changes: { height: 12 } }] };
    const fetcher = vi.fn().mockResolvedValue(Response.json({ choices: [{ message: { content: JSON.stringify(intent) } }] }));
    expect(await runAI({ mode: 'interpret', connection, instruction: 'Make it taller', project: sampleProject() }, fetcher)).toEqual({ intent });
    const bad = vi.fn().mockResolvedValue(new Response(connection.key, { status: 401 }));
    await expect(runAI({ mode: 'test', connection }, bad)).rejects.toThrow('The provider rejected');
  });
  it('rejects an unknown target even when the model returns valid JSON', async () => {
    const fetcher = vi.fn().mockResolvedValue(Response.json({ choices: [{ message: { content: '{"summary":"Edit","actions":[{"type":"update","objectId":"missing","changes":{"height":3}}]}' } }] }));
    await expect(runAI({ mode: 'interpret', connection, instruction: 'Edit', project: sampleProject() }, fetcher)).rejects.toThrow(/no longer available/);
  });
  it('limits streamed bodies, including requests without content-length', async () => {
    await expect(readLimited(new Response('123456'), 5)).rejects.toThrow(/too large/);
  });
  it('rejects cross-origin calls and serves validation errors without caching', async () => {
    const denied = await POST(new Request('https://sketch.example/api/ai', { method: 'POST', headers: { origin: 'https://elsewhere.example', 'content-type': 'application/json' }, body: '{}' }));
    expect(denied.status).toBe(403);
    const response = await POST(new Request('https://sketch.example/api/ai', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"connection":{"key":"test-only-secret"}}' }));
    expect(response.status).toBe(400); expect(response.headers.get('cache-control')).toBe('no-store'); expect(await response.text()).not.toContain('test-only-secret');
  });
});
