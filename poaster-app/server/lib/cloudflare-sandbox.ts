import type { ExecResult, Sandbox } from '@cloudflare/sandbox';

export const SANDBOX_CWD = '/workspace';
const COMMAND_TIMEOUT_MS = 600_000;

export type AgentSession = {
  id: string;
  provider: 'cloudflare-sandbox';
  providerSessionId: string | null;
  status: 'ready' | 'stopped' | 'error';
  cwd: string | null;
  errorMessage: string | null;
};

export type CloudflareSandboxStreamEvent =
  | { stream: 'stdout' | 'stderr'; text: string }
  | { stream: 'exit'; code: number };

export class CloudflareSandboxCommandError extends Error {
  constructor(message: string, readonly debug: unknown) {
    super(message);
    this.name = 'CloudflareSandboxCommandError';
  }
}

export function sandboxSession(id: string, status: AgentSession['status'] = 'ready', errorMessage: string | null = null): AgentSession {
  return { id, provider: 'cloudflare-sandbox', providerSessionId: `poaster-${id}`, status, cwd: SANDBOX_CWD, errorMessage };
}

export class CloudflareSandboxClient {
  constructor(private readonly binding: DurableObjectNamespace<Sandbox<unknown>>) {}

  static fromEnv(env: { Sandbox?: DurableObjectNamespace<Sandbox<unknown>> }): CloudflareSandboxClient | null {
    return env.Sandbox ? new CloudflareSandboxClient(env.Sandbox) : null;
  }

  async createSession(id: string): Promise<AgentSession> {
    const session = sandboxSession(id);
    await (await this.sandbox(session.providerSessionId!)).exec('mkdir -p /workspace', { cwd: SANDBOX_CWD, timeout: 60_000 });
    return session;
  }

  async deleteSession(id: string): Promise<void> {
    await (await this.sandbox(sandboxSession(id).providerSessionId!)).destroy();
  }

  async streamCommand(id: string, command: string, onEvent: (event: CloudflareSandboxStreamEvent) => void | Promise<void>) {
    const providerSessionId = sandboxSession(id).providerSessionId!;
    const request = { sandboxId: providerSessionId, command: redactCommandForDebug(command), cwd: SANDBOX_CWD, timeout: COMMAND_TIMEOUT_MS, stream: true };
    let stdout = '';
    let stderr = '';
    const pending: Promise<void>[] = [];
    const result = await (await this.sandbox(providerSessionId)).exec(command, {
      cwd: SANDBOX_CWD,
      timeout: COMMAND_TIMEOUT_MS,
      stream: true,
      onOutput: (stream, data) => {
        if (stream === 'stdout') stdout += data;
        else stderr += data;
        pending.push(Promise.resolve(onEvent({ stream, text: data })));
      },
    });
    await Promise.all(pending);
    await onEvent({ stream: 'exit', code: result.exitCode });
    const debug = { request, response: result };
    if (!result.success) throw new CloudflareSandboxCommandError(`Cloudflare Sandbox command failed: ${result.exitCode} ${result.stderr.slice(0, 240)}`, debug);
    return { stdout: stdout || `${result.stdout}${stderr}`, parsed: result as ExecResult, debug };
  }

  private async sandbox(id: string): Promise<Sandbox<unknown>> {
    const { getSandbox } = await import('@cloudflare/sandbox');
    return getSandbox(this.binding, id, {
      // ponytail: Board uses HTTP while RPC upgrade is flaky; switch back when Cloudflare fixes it.
      transport: 'http',
      enableDefaultSession: false,
      sleepAfter: '15m',
      normalizeId: true,
      containerTimeouts: { instanceGetTimeoutMS: 60_000, portReadyTimeoutMS: 180_000 },
    });
  }
}

function redactCommandForDebug(command: string): string {
  return command
    .replace(/(AWS_ACCESS_KEY_ID=)'[^']*'/g, "$1'<redacted>'")
    .replace(/(AWS_SECRET_ACCESS_KEY=)'[^']*'/g, "$1'<redacted>'")
    .replace(/(AWS_SESSION_TOKEN=)'[^']*'/g, "$1'<redacted>'")
    .replace(/(AWS_BEARER_TOKEN_BEDROCK=)'[^']*'/g, "$1'<redacted>'")
    .replace(/(OPENAI_CODEX_OAUTH_JSON=)'[^']*'/g, "$1'<redacted>'");
}
