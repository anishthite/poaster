import { createServer } from 'node:http';
import { createReadStream, realpathSync } from 'node:fs';
import { appendFile, mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { execFileSync, spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const root = path.resolve(process.argv[2] || process.cwd());
const publicDir = path.join(root, 'public');
const guidanceFile = process.env.TWEET_GUIDANCE_PATH || path.resolve(root, '..', 'poaster-app', 'sandbox-runtime', 'tweet-guidance.md');
const replyGuidanceFile = process.env.REPLY_GUIDANCE_PATH || path.resolve(root, '..', 'poaster-app', 'sandbox-runtime', 'reply-guidance.md');
const port = Number(process.env.TWITTER_DAILY_PORT || 8787);
const token = randomUUID();
const logFile = path.join(root, '.runs', 'web-run-latest.log');
const reviewDir = path.join(root, 'data', 'reviews');

let sdkInit = null;
let sdkSession = null;
let sdkAuthorized = false;
let allowNextChromeConfirm = false;
let running = null;
let logText = '';
let lastChromeToolError = '';

const WORKFLOWS = {
  timeline: { label: 'Scrape timeline + replies', source: 'home-timeline-with-replies', needsChrome: true, suffix: '-timeline' },
};

const json = (res, status, body) => {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  res.end(JSON.stringify(body));
};

const text = (res, status, body) => {
  res.writeHead(status, { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' });
  res.end(body);
};

const authed = (req) => req.headers['x-twitter-daily-token'] === token || [`http://127.0.0.1:${port}`, `http://localhost:${port}`].includes(req.headers.origin);
const now = () => new Date().toISOString();
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const workflowKey = (value) => WORKFLOWS[value] ? value : 'timeline';
const workflowList = () => Object.entries(WORKFLOWS).map(([id, workflow]) => ({ id, label: workflow.label, source: workflow.source, needsChrome: workflow.needsChrome, needsTweetUrl: Boolean(workflow.needsTweetUrl) }));
const asArray = (value) => Array.isArray(value) ? value : [];

function workflowPaths(day, key) {
  const stem = `${day}${WORKFLOWS[key].suffix}`;
  return {
    raw: path.join(root, 'data', 'raw', `${stem}.json`),
    digest: path.join(root, 'data', 'digests', `${stem}.json`),
    context: path.join(root, 'data', 'context', `${day}.json`),
    guidance: guidanceFile,
    replyGuidance: replyGuidanceFile,
    suggestions: path.join(root, 'data', 'suggestions', `${stem}.json`),
  };
}

function sanitizeTweetUrl(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  let parsed;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error('tweet URL must be a valid x.com status URL');
  }
  if (!['x.com', 'twitter.com', 'www.x.com', 'www.twitter.com'].includes(parsed.hostname)) throw new Error('tweet URL must be on x.com or twitter.com');
  if (!/\/status\/\d+/.test(parsed.pathname)) throw new Error('tweet URL must include /status/<id>');
  return parsed.href;
}

function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function cleanLog(raw) {
  return String(raw || '')
    .replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, '')
    .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/\n{3,}/g, '\n\n');
}

async function resetLog(header = '') {
  await mkdir(path.dirname(logFile), { recursive: true });
  logText = header;
  await writeFile(logFile, header);
}

function appendLog(chunk) {
  const textChunk = String(chunk ?? '');
  if (!textChunk) return;
  logText = (logText + textChunk).slice(-50_000);
  appendFile(logFile, textChunk).catch(() => {});
}

async function bridgeStatus() {
  try {
    const res = await fetch('http://127.0.0.1:17318/status', { signal: AbortSignal.timeout(1000) });
    return await res.json();
  } catch (error) {
    return { connected: false, error: error.message };
  }
}

async function chromeBridgeCommand(action, params = {}, timeoutMs = 30_000) {
  const res = await fetch('http://127.0.0.1:17318/command', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ action, params, timeoutMs }),
    signal: AbortSignal.timeout(timeoutMs + 5_000),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.ok) throw new Error(data.error || `Chrome bridge HTTP ${res.status}`);
  return data.result;
}

function connectorUrl(status) {
  const id = String(status?.clientName || '').match(/\b[a-p]{32}\b/)?.[0];
  return id ? `chrome://extensions/?id=${id}` : 'chrome://extensions';
}

function openExternal(url) {
  const child = process.platform === 'darwin'
    ? spawn('open', ['-a', 'Google Chrome', url], { detached: true, stdio: 'ignore' })
    : spawn(process.platform === 'win32' ? 'cmd' : 'xdg-open', process.platform === 'win32' ? ['/c', 'start', '', url] : [url], { detached: true, stdio: 'ignore' });
  child.unref();
}

async function openConnectorPage(status) {
  const url = connectorUrl(status || await bridgeStatus());
  openExternal(url);
  appendLog(`[chrome] opened ${url}; click Reload on Pi Chrome Connector, then retry\n`);
  return url;
}

async function openXUrl(url = 'https://x.com/home') {
  const status = await bridgeStatus();
  if (!status.connected) throw new Error('Pi Chrome Connector is not connected. Load it in Chrome, then retry.');
  try {
    await chromeBridgeCommand('tab.version', {}, 10_000);
  } catch (error) {
    const url = await openConnectorPage(status);
    throw new Error(`Pi Chrome Connector is connected but not returning command results. I opened ${url}; click Reload on Pi Chrome Connector, then retry. Cause: ${error.message}`);
  }
  appendLog(`[chrome] opening ${url} before handing off to Pi\n`);
  await chromeBridgeCommand('tab.new', { url, group: false });
}

async function openXHome() {
  await openXUrl('https://x.com/home');
}

async function digestStatus() {
  try {
    return JSON.parse(await readFile(path.join(publicDir, 'digests', 'index.json'), 'utf8'));
  } catch {
    return [];
  }
}

async function contextStatus() {
  try {
    return JSON.parse(await readFile(path.join(publicDir, 'context', 'index.json'), 'utf8'));
  } catch {
    return [];
  }
}

async function suggestionStatus() {
  try {
    return JSON.parse(await readFile(path.join(publicDir, 'suggestions', 'index.json'), 'utf8'));
  } catch {
    return [];
  }
}

const REVIEW_DECISIONS = new Set(['approve', 'deny']);

function safeSuggestionFile(value) {
  const input = String(value || '');
  const file = path.basename(input);
  if (!file || file !== input || !/^[\w.-]+\.json$/.test(file)) throw new Error('bad suggestion file');
  return file;
}

function reviewFileFor(suggestionFile) {
  return suggestionFile.replace(/\.json$/, '-reviews.json');
}

async function readJsonFile(file, fallback) {
  try {
    return JSON.parse(await readFile(file, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') return fallback;
    throw error;
  }
}

async function readSuggestionForReview(suggestionFile, suggestionIndex) {
  const file = safeSuggestionFile(suggestionFile);
  const batch = await readJsonFile(path.join(root, 'data', 'suggestions', file), null);
  if (!batch) throw new Error('suggestion file not found');
  const items = asArray(batch.items || batch.suggestions);
  const index = Number(suggestionIndex);
  if (!Number.isInteger(index) || index < 0 || index >= items.length) throw new Error('bad suggestion index');
  return { file, batch, index, item: items[index] };
}

async function readReviewBatch(suggestionFile) {
  const sourceFile = safeSuggestionFile(suggestionFile);
  const file = reviewFileFor(sourceFile);
  const existing = await readJsonFile(path.join(reviewDir, file), null);
  return { file, sourceSuggestionFile: sourceFile, reviews: asArray(existing?.reviews), updatedAt: existing?.updatedAt || null };
}

async function saveReview(body) {
  const { file: sourceFile, batch, index, item } = await readSuggestionForReview(body.suggestionFile, body.suggestionIndex);
  const decision = String(body.decision || '').toLowerCase();
  if (!REVIEW_DECISIONS.has(decision)) throw new Error('decision must be approve or deny');
  const reviewedAt = now();
  const review = {
    id: `${sourceFile}#${index}`,
    suggestionFile: sourceFile,
    suggestionIndex: index,
    decision,
    note: String(body.note || '').trim().slice(0, 2000),
    reviewedAt,
    suggestion: {
      kind: item.kind || item.type || 'post',
      text: item.text || item.draft || '',
      why: item.why || item.note || '',
      evidenceUrls: asArray(item.evidenceUrls),
      confidence: item.confidence || null,
    },
  };
  const current = await readReviewBatch(sourceFile);
  const reviews = current.reviews.filter((entry) => entry?.id !== review.id).concat(review)
    .sort((a, b) => Number(a.suggestionIndex) - Number(b.suggestionIndex));
  await mkdir(reviewDir, { recursive: true });
  await writeFile(path.join(reviewDir, current.file), JSON.stringify({
    date: batch.date || null,
    sourceSuggestionFile: sourceFile,
    updatedAt: reviewedAt,
    reviews,
  }, null, 2) + '\n');
  return { ok: true, file: current.file, review };
}

async function readJsonBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString('utf8').trim();
  return raw ? JSON.parse(raw) : {};
}

async function runLog() {
  const [raw, info] = await Promise.all([
    logText ? Promise.resolve(logText) : readFile(logFile, 'utf8').catch(() => ''),
    stat(logFile).catch(() => null),
  ]);
  return { log: cleanLog(raw).slice(-30_000), size: raw.length, updatedAt: info?.mtime?.toISOString?.() ?? null };
}

async function importPiSdk() {
  try {
    return await import('@earendil-works/pi-coding-agent');
  } catch {}

  const explicit = process.env.PI_CODING_AGENT_SDK_PATH;
  if (explicit) {
    const target = explicit.endsWith('.js') ? explicit : path.join(explicit, 'dist', 'index.js');
    return import(pathToFileURL(target).href);
  }

  const piBin = execFileSync('sh', ['-lc', 'command -v pi'], { encoding: 'utf8' }).trim();
  if (!piBin) throw new Error('Could not find pi on PATH. Set PI_CODING_AGENT_SDK_PATH to the package root.');
  const realPi = realpathSync(piBin);
  const packageRoot = path.dirname(path.dirname(realPi));
  return import(pathToFileURL(path.join(packageRoot, 'dist', 'index.js')).href);
}

function webUiContext() {
  const flatTheme = { fg: (_key, value) => String(value ?? '') };
  return {
    select: async (title, options) => {
      appendLog(`\n[ui select denied] ${title}: ${options.join(', ')}\n`);
      return undefined;
    },
    confirm: async (title, message) => {
      const ok = allowNextChromeConfirm && /Authorize pi-chrome control/i.test(title);
      allowNextChromeConfirm = false;
      appendLog(`\n[ui confirm ${ok ? 'approved' : 'denied'}] ${title}\n${message}\n`);
      return ok;
    },
    input: async (title) => {
      appendLog(`\n[ui input denied] ${title}\n`);
      return undefined;
    },
    notify: (message, type = 'info') => appendLog(`\n[${type}] ${message}\n`),
    onTerminalInput: () => () => {},
    setStatus: () => {},
    setWorkingMessage: () => {},
    setWorkingVisible: () => {},
    setWorkingIndicator: () => {},
    setHiddenThinkingLabel: () => {},
    setWidget: () => {},
    setFooter: () => {},
    setHeader: () => {},
    setTitle: () => {},
    custom: async () => undefined,
    pasteToEditor: () => {},
    setEditorText: () => {},
    getEditorText: () => '',
    editor: async () => undefined,
    addAutocompleteProvider: () => {},
    setEditorComponent: () => {},
    getEditorComponent: () => undefined,
    theme: flatTheme,
    getAllThemes: () => [],
    getTheme: () => undefined,
    setTheme: () => ({ success: false, error: 'Theme UI unavailable in web runner.' }),
    getToolsExpanded: () => false,
    setToolsExpanded: () => {},
  };
}

function subscribeToSession(session) {
  session.subscribe((event) => {
    if (event.type === 'agent_start') appendLog('\n[agent started]\n');
    else if (event.type === 'agent_end') appendLog('\n[agent finished]\n');
    else if (event.type === 'tool_execution_start') appendLog(`\n[tool start] ${event.toolName || 'tool'}\n`);
    else if (event.type === 'tool_execution_end') {
      const toolName = event.toolName || 'tool';
      appendLog(`\n[tool ${event.isError ? 'error' : 'done'}] ${toolName}\n`);
      if (event.isError) {
        const message = cleanLog(JSON.stringify(event.result ?? '')).slice(0, 2000);
        appendLog(`${message}\n`);
        if (toolName.startsWith('chrome_') && /timed out after \d+ms/i.test(message)) lastChromeToolError = `${toolName}: ${message}`;
      }
    }
    else if (event.type === 'tool_execution_update' && event.text) appendLog(event.text);
    else if (event.type === 'message_update') {
      const update = event.assistantMessageEvent;
      if (update?.type === 'text_delta') appendLog(update.delta);
    }
  });
}

async function ensureSdkSession() {
  if (sdkSession) return sdkSession;
  if (sdkInit) return sdkInit;
  sdkInit = (async () => {
    appendLog(`[sdk] starting Pi SDK session at ${now()}\n`);
    const {
      createAgentSession,
      DefaultResourceLoader,
      getAgentDir,
      SessionManager,
    } = await importPiSdk();
    const loader = new DefaultResourceLoader({ cwd: root, agentDir: getAgentDir() });
    await loader.reload();
    const { session, extensionsResult, modelFallbackMessage } = await createAgentSession({
      cwd: root,
      resourceLoader: loader,
      sessionManager: SessionManager.inMemory(root),
    });
    subscribeToSession(session);
    await session.bindExtensions({ mode: 'rpc', uiContext: webUiContext() });
    for (const error of extensionsResult.errors || []) appendLog(`[extension error] ${error.path}: ${error.error}\n`);
    if (modelFallbackMessage) appendLog(`[model] ${modelFallbackMessage}\n`);
    appendLog('[sdk] ready\n');
    sdkSession = session;
    return session;
  })().catch((error) => {
    sdkInit = null;
    appendLog(`\n[sdk error] ${error.stack || error.message}\n`);
    throw error;
  });
  return sdkInit;
}

async function authorizeChrome({ reset = true } = {}) {
  if (reset) await resetLog(`[sdk] authorize requested at ${now()}\n`);
  const session = await ensureSdkSession();
  allowNextChromeConfirm = true;
  await session.prompt('/chrome authorize indefinite');
  await session.prompt('/chrome background on');
  await sleep(750); // ponytail: extension commands can settle just after prompt() resolves.
  sdkAuthorized = true;
  appendLog('[sdk] Chrome authorization command finished.\n');
}

async function renderPublic() {
  appendLog('\n[render] rebuilding public page\n');
  await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(root, 'scripts', 'render.mjs'), root], { cwd: root });
    child.stdout.on('data', appendLog);
    child.stderr.on('data', appendLog);
    child.on('error', reject);
    child.on('close', (code) => code === 0 ? resolve() : reject(new Error(`render exited ${code}`)));
  });
}

async function dailyPrompt(day, key, { tweetUrl = '' } = {}) {
  const workflow = WORKFLOWS[key];
  const paths = workflowPaths(day, key);
  const state = path.join(root, 'data', 'state.json');
  const openedUrl = tweetUrl || 'https://x.com/home';
  const runnerNotes = workflow.needsChrome ? `- The runner has already opened ${openedUrl} in Chrome.
- Do not call chrome_tab with action=list as an access check; use the current X tab.
- Chrome is running in background mode; avoid input-only tools for scrolling.
- Do not use chrome_scroll. Use chrome_evaluate with window.scrollBy/document.scrollingElement.scrollTo so scrolling works in the background.
- If chrome_scroll or chrome_evaluate times out, retry once with a smaller visible-article DOM read. Do not ask for /chrome authorize; this SDK session already authorized Chrome.` : key.includes('guidance') ? `- Read local JSON files and guidance markdown only; do not use Chrome.
- Update only the relevant tweet or reply guidance markdown when a learning is durable and not already covered.
- If nothing should change, leave markdown as-is and write a digest with an empty changes list.` : `- Read local JSON files only; do not use Chrome.
- If an expected own/timeline source file is missing, write the context pack with a caveat instead of inventing data.`;
  const prompt = `${await readFile(path.join(root, 'prompts', 'daily-twitter.md'), 'utf8')}

Run config:
- workflow: ${key}
- date: ${day}
- source: ${workflow.source}
- raw output path: ${paths.raw}
- digest output path: ${paths.digest}
- context output path: ${paths.context}
- guidance file path: ${paths.guidance}
- reply guidance file path: ${paths.replyGuidance}
- suggestions output path: ${paths.suggestions}
- review data dir path: ${reviewDir}
- target tweet URL: ${tweetUrl || 'none'}
- state file path: ${state}

Runner notes:
${runnerNotes}
`;
  await mkdir(path.dirname(paths.raw), { recursive: true });
  await mkdir(path.dirname(paths.digest), { recursive: true });
  await mkdir(path.dirname(paths.context), { recursive: true });
  await mkdir(path.dirname(paths.suggestions), { recursive: true });
  return { prompt, paths, workflow };
}

async function outputsExist(key, paths) {
  const required = key === 'context' ? [paths.context, paths.digest]
    : key === 'suggestions' ? [paths.suggestions, paths.digest]
      : [paths.digest];
  const results = await Promise.all(required.map((file) => stat(file).then((s) => s.size > 0).catch(() => false)));
  return results.every(Boolean);
}

function retryableChromeTimeout(error) {
  return /chrome_scroll|dispatchMouseEvent|chrome_evaluate|Runtime\.evaluate/i.test(error || '');
}

async function runDaily(requestedWorkflow = 'timeline', options = {}) {
  if (running && !running.done) throw new Error('run already active');
  const key = workflowKey(requestedWorkflow || process.env.TWITTER_DAILY_WORKFLOW || 'timeline');
  const tweetUrl = sanitizeTweetUrl(options.tweetUrl);
  if (WORKFLOWS[key].needsTweetUrl && !tweetUrl) throw new Error('tweet URL required for reply learning');
  const day = today();
  const source = WORKFLOWS[key].source;
  await resetLog(`[sdk] ${WORKFLOWS[key].label} requested at ${now()}\n`);
  lastChromeToolError = '';
  running = { mode: 'sdk', workflow: key, label: WORKFLOWS[key].label, startedAt: now(), log: logFile, done: false, day, source, tweetUrl: tweetUrl || undefined };
  void (async () => {
    try {
      if (WORKFLOWS[key].needsChrome) {
        await authorizeChrome({ reset: false });
        await openXUrl(tweetUrl || 'https://x.com/home');
      }
      const session = await ensureSdkSession();
      appendLog(`[sdk] running ${WORKFLOWS[key].label} for ${day} (${source})\n`);
      const { prompt, paths } = await dailyPrompt(day, key, { tweetUrl });
      await session.prompt(prompt);
      let exists = await outputsExist(key, paths);
      if (WORKFLOWS[key].needsChrome && !exists && retryableChromeTimeout(lastChromeToolError)) {
        appendLog('[sdk] Chrome DOM tool timed out; retrying with smaller background-safe DOM reads\n');
        lastChromeToolError = '';
        await session.prompt(`${prompt}\nRetry after Chrome DOM timeout:\n- Do not use chrome_scroll.\n- Navigate or activate ${tweetUrl || 'https://x.com/home'} if needed.\n- Use tiny synchronous chrome_evaluate snippets only: first read location/title/article count, then map at most 10 visible article nodes to text, links, timestamps, authors, and visible metrics.\n- Do not run full-page text extraction, async waits, or large selector loops inside chrome_evaluate.\n- Use window.scrollBy/document.scrollingElement.scrollTo only in short chrome_evaluate calls.\n- If scrolling stalls after collecting at least one valid item, write raw and digest from those collected items.\n- If every chrome_evaluate call times out, stop without writing fake output.\n`);
        exists = await outputsExist(key, paths);
      }
      if (!exists && lastChromeToolError) throw new Error(`Chrome tool failed before writing output: ${lastChromeToolError}`);
      if (!exists) throw new Error(`No output written for ${WORKFLOWS[key].label}`);
      await renderPublic();
      running = { ...running, done: true, finishedAt: now(), outputs: paths };
      appendLog(`[sdk] ${WORKFLOWS[key].label} finished at ${running.finishedAt}\n`);
    } catch (error) {
      running = { ...running, done: true, error: error.message, finishedAt: now() };
      appendLog(`\n[run error] ${error.stack || error.message}\n`);
    }
  })();
}

async function serveIndex(res) {
  const file = await readFile(path.join(publicDir, 'index.html'), 'utf8');
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
  res.end(file.replaceAll('__TWITTER_DAILY_TOKEN__', token));
}

async function serveStatic(req, res, pathname) {
  const file = path.normalize(path.join(publicDir, pathname));
  if (!file.startsWith(publicDir)) return text(res, 403, 'forbidden');
  const info = await stat(file).catch(() => null);
  if (!info?.isFile()) return text(res, 404, 'not found');
  const ext = path.extname(file);
  const type = ext === '.json' ? 'application/json; charset=utf-8' : 'application/octet-stream';
  res.writeHead(200, { 'content-type': type });
  createReadStream(file).pipe(res);
}

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url || '/', `http://${req.headers.host || '127.0.0.1'}`);
    if (req.method === 'GET' && url.pathname === '/') return serveIndex(res);
    if (req.method === 'GET' && url.pathname === '/api/status') {
      return json(res, 200, { bridge: await bridgeStatus(), digests: await digestStatus(), contexts: await contextStatus(), suggestions: await suggestionStatus(), workflows: workflowList(), running, sdk: { ready: Boolean(sdkSession), authorized: sdkAuthorized } });
    }
    if (req.method === 'GET' && url.pathname === '/api/log') return json(res, 200, await runLog());
    if (req.method === 'GET' && url.pathname === '/api/reviews') {
      if (!authed(req)) return json(res, 403, { error: 'bad token' });
      return json(res, 200, await readReviewBatch(url.searchParams.get('file')));
    }
    if (req.method === 'POST' && (url.pathname === '/api/authorize' || url.pathname === '/api/auth')) {
      if (!authed(req)) return json(res, 403, { error: 'bad token' });
      if (running && !running.done) return json(res, 409, { error: 'run already active', running });
      await authorizeChrome();
      return json(res, 200, { ok: true, message: 'Authorized Chrome in the Pi SDK session.' });
    }
    if (req.method === 'POST' && url.pathname === '/api/run') {
      if (!authed(req)) return json(res, 403, { error: 'bad token' });
      const body = await readJsonBody(req);
      await runDaily(body.workflow, { tweetUrl: body.tweetUrl });
      return json(res, 202, { ok: true, running, message: `Started ${running.label}. Watch the log panel.` });
    }
    if (req.method === 'POST' && url.pathname === '/api/reviews') {
      if (!authed(req)) return json(res, 403, { error: 'bad token' });
      return json(res, 200, await saveReview(await readJsonBody(req)));
    }
    if (req.method === 'POST' && url.pathname === '/api/open-connector') {
      if (!authed(req)) return json(res, 403, { error: 'bad token' });
      const url = await openConnectorPage();
      return json(res, 200, { ok: true, message: `Opened ${url}. Click Reload on Pi Chrome Connector, then retry.` });
    }
    if (req.method === 'GET') return serveStatic(req, res, url.pathname.slice(1));
    text(res, 405, 'method not allowed');
  } catch (error) {
    json(res, 500, { error: error.message });
  }
});

server.listen(port, '127.0.0.1', () => {
  console.log(`Twitter Daily: http://127.0.0.1:${port}`);
  resetLog(`[server] Twitter Daily SDK server started at ${now()}\n`).catch(() => {});
});
