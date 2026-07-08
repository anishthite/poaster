import { handleApiRequest } from '../server';
import type { Env } from '../server/env';

export { Sandbox } from '@cloudflare/sandbox';

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/api/')) return handleApiRequest(request, env);
    if (!env.ASSETS) return new Response('asset binding missing', { status: 500 });
    return env.ASSETS.fetch(request);
  },
};
