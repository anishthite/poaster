const RUNTIME_DIR = '/workspace/poaster-sandbox-runtime';
const PI_DIR = '/root/.pi';
const SESSION_DIR = `${PI_DIR}/sessions`;
const AGENT_DIR = `${PI_DIR}/agent`;

const SECRET_ENV_KEYS = [
  'AWS_ACCESS_KEY_ID',
  'AWS_SECRET_ACCESS_KEY',
  'AWS_SESSION_TOKEN',
  'AWS_BEARER_TOKEN_BEDROCK',
  'OPENAI_CODEX_OAUTH_JSON',
];

export type PiPromptInput = {
  sessionId: string;
  message: string;
  draft?: string | null;
  postedPreview?: string | null;
  tweetUrl?: string | null;
  workdir?: string | null;
  llmProvider?: string | null;
  llmModel?: string | null;
  thinkingLevel?: string | null;
  awsRegion?: string | null;
  awsAccessKeyId?: string | null;
  awsSecretAccessKey?: string | null;
  awsSessionToken?: string | null;
  awsBearerTokenBedrock?: string | null;
  openaiCodexOAuthJson?: string | null;
};

export function buildPiRuntimeBootstrapCommand(): string {
  return [
    `mkdir -p ${shellWord(SESSION_DIR)} ${shellWord(AGENT_DIR)} /workspace`,
    `test -f ${shellWord(`${RUNTIME_DIR}/pi-runner.js`)}`,
  ].join(' && ');
}

export function buildPiPromptCommand(input: PiPromptInput): string {
  const prompt = [
    'You are helping build and improve a post in Poaster.',
    'Be concrete. If editing copy, return usable alternatives. If asked about implementation, inspect files first.',
    '',
    `Current draft:\n${input.draft || '(empty)'}`,
    `Local tweeted preview:\n${input.postedPreview || '(none)'}`,
    `Real tweet URL:\n${input.tweetUrl || '(none)'}`,
    '',
    `User request:\n${input.message}`,
  ].join('\n');

  const env = [
    ['POASTER_AGENT_SESSION_ID', input.sessionId],
    ['PI_WORKDIR', input.workdir || '/workspace'],
    ['PI_SESSION_DIR', SESSION_DIR],
    ['PI_CODING_AGENT_DIR', AGENT_DIR],
    ['LLM_PROVIDER', input.llmProvider || 'amazon-bedrock'],
    ['LLM_MODEL', input.llmModel],
    ['PI_THINKING_LEVEL', input.thinkingLevel || 'medium'],
    ['OPENAI_CODEX_OAUTH_JSON', input.openaiCodexOAuthJson],
    ['AWS_REGION', input.awsRegion],
    ['AWS_ACCESS_KEY_ID', input.awsAccessKeyId],
    ['AWS_SECRET_ACCESS_KEY', input.awsSecretAccessKey],
    ['AWS_SESSION_TOKEN', input.awsSessionToken],
    ['AWS_BEARER_TOKEN_BEDROCK', input.awsBearerTokenBedrock],
    ['BEDROCK_MODEL_ID', input.llmProvider === 'amazon-bedrock' ? input.llmModel : undefined],
  ]
    .filter((item): item is [string, string] => typeof item[1] === 'string' && item[1].length > 0)
    .map(([key, value]) => `${key}=${shellWord(value)}`)
    .join(' ');
  return `${buildPiRuntimeBootstrapCommand()} && cd ${shellWord(RUNTIME_DIR)} && ${env} node pi-runner.js ${shellWord(prompt)}`;
}

export function redactPiPromptCommand(command: string): string {
  let out = command;
  for (const key of SECRET_ENV_KEYS) out = out.replace(new RegExp(`${key}='[^']*'`, 'g'), `${key}='<redacted>'`);
  return out;
}

function shellWord(s: string): string {
  return `'${s.replace(/'/g, `'\\''`)}'`;
}
