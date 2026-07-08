import type { Env } from './env';
import { handleAgentRequest } from './routes/agent';

export async function handleApiRequest(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  if (url.pathname.startsWith('/api/agent/')) return handleAgentRequest(request, env);
  return new Response(JSON.stringify({ error: 'not found' }), { status: 404, headers: { 'content-type': 'application/json' } });
}
