import type { Env } from '../env';
import { CloudflareSandboxClient, sandboxSession } from '../lib/cloudflare-sandbox';
import { buildPiPromptCommand, redactPiPromptCommand } from '../lib/pi-runtime';

export async function handleAgentRequest(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const parts = url.pathname.replace(/^\/api\/agent\/?/, '').split('/').filter(Boolean);

  if (request.method === 'POST' && parts[0] === 'sessions' && parts.length === 1) return createSession(request, env);
  if (request.method === 'POST' && parts[0] === 'sessions' && parts[2] === 'start') return startSession(parts[1]!, env);
  if (request.method === 'POST' && parts[0] === 'sessions' && parts[2] === 'stop') return stopSession(parts[1]!, env);
  if (request.method === 'DELETE' && parts[0] === 'sessions' && parts.length === 2) return deleteSession(parts[1]!, env);
  if (request.method === 'POST' && parts[0] === 'sessions' && parts[2] === 'pi' && parts[3] === 'stream') return streamTurn(request, env, parts[1]!);

  return json({ error: 'not found' }, 404);
}

async function createSession(request: Request, env: Env): Promise<Response> {
  const body = await request.json().catch(() => ({})) as { title?: unknown };
  const id = crypto.randomUUID().replace(/-/g, '').slice(0, 12);
  const title = typeof body.title === 'string' ? body.title.trim().slice(0, 120) : null;
  const client = CloudflareSandboxClient.fromEnv(env);
  if (!client) return json({ error: 'agent runtime is not configured' }, 503);
  return json({ session: await client.createSession(id, title) }, 201);
}

async function startSession(id: string, env: Env): Promise<Response> {
  const client = CloudflareSandboxClient.fromEnv(env);
  if (!client) return json({ error: 'agent runtime is not configured' }, 503);
  return json({ session: await client.createSession(id) });
}

async function stopSession(id: string, env: Env): Promise<Response> {
  const client = CloudflareSandboxClient.fromEnv(env);
  if (client) await client.deleteSession(id).catch(() => null);
  return json({ session: sandboxSession(id, 'stopped') });
}

async function deleteSession(id: string, env: Env): Promise<Response> {
  const client = CloudflareSandboxClient.fromEnv(env);
  if (client) await client.deleteSession(id).catch(() => null);
  return json({ session: { ...sandboxSession(id, 'stopped'), deletedAt: Date.now() } });
}

async function streamTurn(request: Request, env: Env, id: string): Promise<Response> {
  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const message = typeof body.message === 'string' ? body.message.trim().slice(0, 200_000) : '';
  const history = readHistory(body.history);
  if (!message) return json({ error: 'message required' }, 400);
  const client = CloudflareSandboxClient.fromEnv(env);
  if (!client) return json({ error: 'agent runtime is not configured' }, 503);

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const emit = (event: Record<string, unknown>) => controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      let answer = '';
      let fallback = '';
      let lineBuffer = '';
      try {
        emit({ type: 'status', message: 'starting…' });
        const model = resolveModel(env);
        const command = buildPiPromptCommand({
          sessionId: id,
          message,
          draft: typeof body.draft === 'string' ? body.draft : '',
          postedPreview: typeof body.postedPreview === 'string' ? body.postedPreview : '',
          tweetUrl: typeof body.tweetUrl === 'string' ? body.tweetUrl : '',
          history,
          llmProvider: model.provider,
          llmModel: model.model,
          awsRegion: env.AWS_REGION,
          awsAccessKeyId: env.AWS_ACCESS_KEY_ID,
          awsSecretAccessKey: env.AWS_SECRET_ACCESS_KEY,
          awsSessionToken: env.AWS_SESSION_TOKEN,
          awsBearerTokenBedrock: env.AWS_BEARER_TOKEN_BEDROCK,
          openaiCodexOAuthJson: env.OPENAI_CODEX_OAUTH_JSON,
        });
        emit({ type: 'status', message: 'ready' });
        if (body.debug === true) emit({ type: 'debug', command: redactPiPromptCommand(command) });
        const result = await client.streamCommand(id, command, async (event) => {
          if (event.stream === 'stderr') {
            emit({ type: 'stderr', text: event.text });
            return;
          }
          if (event.stream !== 'stdout') return;
          lineBuffer += event.text;
          let nl = lineBuffer.indexOf('\n');
          while (nl >= 0) {
            const line = lineBuffer.slice(0, nl);
            lineBuffer = lineBuffer.slice(nl + 1);
            const parsed = safeJsonObject(line);
            if (!parsed) {
              if (line.trim()) emit({ type: 'raw', text: `${line}\n` });
            } else {
              const delta = piTextDelta(parsed);
              if (delta) {
                answer += delta;
                emit({ type: 'stdout', text: delta });
              }
              fallback = piAssistantText(parsed) || fallback;
              if (!delta) emit({ type: 'pi_event', event: parsed });
            }
            nl = lineBuffer.indexOf('\n');
          }
        });
        if (lineBuffer) fallback = `${fallback}\n${lineBuffer}`.trim();
        const finalAnswer = (answer || fallback || result.stdout || 'Done.').trim();
        emit({ type: 'done', answer: finalAnswer });
      } catch (err) {
        emit({ type: 'error', message: String(err instanceof Error ? err.message : err).slice(0, 500) });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-cache, no-transform',
      connection: 'keep-alive',
    },
  });
}

function readHistory(value: unknown): Array<{ role: 'user' | 'assistant'; content: string }> {
  if (!Array.isArray(value)) return [];
  return value.slice(-20).flatMap((item) => {
    if (!isRecord(item)) return [];
    const role = item.role === 'user' || item.role === 'assistant' ? item.role : null;
    const content = typeof item.content === 'string' ? item.content.trim().slice(0, 20_000) : '';
    return role && content ? [{ role, content }] : [];
  });
}

function resolveModel(env: Env): { provider: string; model: string } {
  const qualified = env.AGENT_LLM_MODEL_ID || '';
  if (qualified.includes('/')) {
    const [provider, ...rest] = qualified.split('/');
    return { provider: provider || 'amazon-bedrock', model: rest.join('/') };
  }
  const provider = env.AGENT_LLM_PROVIDER || (env.OPENAI_CODEX_OAUTH_JSON ? 'openai-codex' : 'amazon-bedrock');
  const model = qualified || (provider === 'openai-codex' ? 'gpt-5.5' : env.BEDROCK_MODEL_ID || 'us.anthropic.claude-opus-4-8');
  return { provider, model };
}

function piTextDelta(event: Record<string, unknown>): string {
  const assistant = isRecord(event.assistantMessageEvent) ? event.assistantMessageEvent : null;
  return assistant?.type === 'text_delta' && typeof assistant.delta === 'string' ? assistant.delta : '';
}

function piAssistantText(event: Record<string, unknown>): string {
  const message = isRecord(event.message) ? event.message : null;
  if (typeof message?.content === 'string') return message.content;
  if (Array.isArray(message?.content)) return message.content.map((item) => isRecord(item) && item.type === 'text' ? item.text : '').filter(Boolean).join('\n');
  return '';
}

function safeJsonObject(line: string): Record<string, unknown> | null {
  try {
    const value = JSON.parse(line);
    return isRecord(value) ? value : null;
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}
