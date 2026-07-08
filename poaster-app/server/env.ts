import type { Sandbox } from '@cloudflare/sandbox';

export type Env = {
  ASSETS?: Fetcher;
  Sandbox?: DurableObjectNamespace<Sandbox<unknown>>;
  AWS_ACCESS_KEY_ID?: string;
  AWS_SECRET_ACCESS_KEY?: string;
  AWS_SESSION_TOKEN?: string;
  AWS_REGION?: string;
  AWS_BEARER_TOKEN_BEDROCK?: string;
  BEDROCK_MODEL_ID?: string;
  AGENT_LLM_PROVIDER?: string;
  AGENT_LLM_MODEL_ID?: string;
  OPENAI_CODEX_OAUTH_JSON?: string;
};
