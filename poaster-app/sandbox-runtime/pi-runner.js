#!/usr/bin/env node

import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createAgentSession, DefaultResourceLoader, SessionManager } from '@earendil-works/pi-coding-agent';
import { getModel } from '@earendil-works/pi-ai';

const prompt = process.argv.slice(2).join(' ').trim();
if (!prompt) throw new Error('prompt required');

const cwd = process.env.PI_WORKDIR || '/workspace';
const sessionDir = process.env.PI_SESSION_DIR || '/root/.pi/sessions';
const agentDir = process.env.PI_CODING_AGENT_DIR || '/root/.pi/agent';
const providerId = process.env.LLM_PROVIDER || (process.env.OPENAI_CODEX_OAUTH_JSON ? 'openai-codex' : 'amazon-bedrock');
const modelId = process.env.LLM_MODEL || process.env.BEDROCK_MODEL_ID || (providerId === 'openai-codex' ? 'gpt-5.5' : 'us.anthropic.claude-opus-4-8');
const thinkingLevel = normalizeThinkingLevel(process.env.PI_THINKING_LEVEL) || 'medium';
const sessionName = safeFileName(process.env.POASTER_AGENT_SESSION_ID || 'poaster');
const sessionFile = `${sessionDir.replace(/\/$/, '')}/${sessionName}.jsonl`;
const runtimeDir = dirname(fileURLToPath(import.meta.url));
const model = getModel(providerId, modelId);
if (!model) throw new Error(`Model not found in pi-ai catalog: ${providerId}/${modelId}`);

mkdirSync(sessionDir, { recursive: true });
mkdirSync(agentDir, { recursive: true });
writeOpenAICodexAuth(agentDir);
if (!existsSync(cwd)) mkdirSync(cwd, { recursive: true });

const resourceLoader = new DefaultResourceLoader({
  cwd,
  agentDir,
  additionalExtensionPaths: [join(runtimeDir, 'node_modules', 'pi-web-access', 'index.ts')],
  additionalSkillPaths: [join(runtimeDir, 'node_modules', 'pi-web-access', 'skills')],
});
await resourceLoader.reload();

let answer = '';
const { session } = await createAgentSession({
  cwd,
  model,
  thinkingLevel,
  agentDir,
  resourceLoader,
  sessionManager: SessionManager.open(sessionFile, sessionDir, cwd),
  tools: ['read', 'bash', 'grep', 'find', 'edit', 'write', 'web_search', 'fetch_content', 'code_search', 'get_search_content'],
});

try {
  session.subscribe((event) => {
    process.stdout.write(`${JSON.stringify(event)}\n`);
    if (event.type === 'message_update' && event.assistantMessageEvent?.type === 'text_delta') {
      answer += event.assistantMessageEvent.delta;
    }
  });

  await session.prompt([
    'You are running inside a Cloudflare Sandbox container for Poaster.',
    'Poaster is a split-pane app: an X-style composer on the left and this agent on the right.',
    'Help the user improve posts, generate alternatives, or inspect/edit files in this sandbox when asked.',
    'Prefer concise, concrete output. Do not claim a post was published; posting uses an X Web Intent unless the user provides a real tweet URL.',
    '',
    prompt,
  ].join('\n'));
} finally {
  session.dispose();
}

if (answer.trim()) process.stderr.write(`[poaster] answer chars=${answer.trim().length}\n`);

function safeFileName(value) {
  return String(value).replace(/[^A-Za-z0-9._-]/g, '_') || 'poaster';
}

function normalizeThinkingLevel(value) {
  return ['off', 'minimal', 'low', 'medium', 'high', 'xhigh'].includes(value || '') ? value : undefined;
}

function writeOpenAICodexAuth(agentDir) {
  const raw = process.env.OPENAI_CODEX_OAUTH_JSON;
  if (!raw) return;
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error('OPENAI_CODEX_OAUTH_JSON must be valid JSON');
  }
  const source = isRecord(parsed) && isRecord(parsed['openai-codex']) ? parsed['openai-codex'] : parsed;
  if (!isRecord(source)) throw new Error('OPENAI_CODEX_OAUTH_JSON must be an oauth object or auth.json object');
  const access = typeof source.access === 'string' ? source.access : '';
  const refresh = typeof source.refresh === 'string' ? source.refresh : '';
  const expires = typeof source.expires === 'number' ? source.expires : Number(source.expires);
  if (!access || !refresh || !Number.isFinite(expires)) throw new Error('OPENAI_CODEX_OAUTH_JSON requires access, refresh, and expires');
  const auth = { type: 'oauth', access, refresh, expires };
  if (typeof source.accountId === 'string') auth.accountId = source.accountId;
  writeFileSync(`${agentDir.replace(/\/$/, '')}/auth.json`, `${JSON.stringify({ 'openai-codex': auth }, null, 2)}\n`, { mode: 0o600 });
}

function isRecord(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}
