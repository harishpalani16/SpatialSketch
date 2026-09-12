import { isSameOrigin } from '@/lib/http';
import { z } from 'zod';
import { readLimited, runAI } from '@/lib/api-server';

export const runtime = 'nodejs';
export const maxDuration = 180;
export async function POST(request: Request) {
  const headers = { 'Cache-Control': 'no-store' };
  if (!isSameOrigin(request)) return Response.json({ error: 'Use the API from this application.' }, { status: 403, headers });
  if (!request.headers.get('content-type')?.includes('application/json')) return Response.json({ error: 'Expected a JSON request.' }, { status: 415, headers });
  try {
    const body = JSON.parse(await readLimited(request, 512 * 1024));
    return Response.json(await runAI(body, fetch, process.env.ALLOWED_AI_HOSTS), { headers });
  } catch (error) {
    const message = error instanceof z.ZodError ? 'Check your API settings and project data.' : error instanceof SyntaxError ? 'The request was not valid JSON.' : error instanceof Error ? error.message : 'The request could not be completed.';
    return Response.json({ error: message }, { status: 400, headers });
  }
}
