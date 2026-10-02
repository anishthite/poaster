#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { mkdir, readFile, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sourceDefault = process.env.TWITTER_DAILY_SOURCE || 'home-timeline-with-replies';
const bold = (text) => process.stdout.isTTY ? `\x1b[1m${text}\x1b[0m` : text;

function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function usage() {
  console.log(`Twitter Daily CLI

Usage:
  npm run cli                  open menu
  npm run cli -- run [date]    guided same-session Pi run
  npm run cli -- headless [date]
  npm run cli -- auth
  npm run cli -- render
  npm run cli -- status

Env:
  TWITTER_DAILY_SOURCE=${sourceDefault}`);
}

function run(command, args, options = {}) {
  return new Promise((resolve) => {
    const child = spawn(command, args, { cwd: root, stdio: 'inherit', env: process.env, ...options });
    child.on('close', (code) => resolve(code ?? 1));
    child.on('error', (error) => {
      console.error(error.message);
      resolve(127);
    });
  });
}

async function bridgeStatus() {
  try {
    const res = await fetch('http://127.0.0.1:17318/status', { signal: AbortSignal.timeout(1000) });
    return await res.json();
  } catch (error) {
    return { connected: false, error: error.message };
  }
}

async function digestIndex() {
  try {
    return JSON.parse(await readFile(path.join(root, 'public', 'digests', 'index.json'), 'utf8'));
  } catch {
    return [];
  }
}

async function printStatus() {
  const [bridge, digests] = await Promise.all([bridgeStatus(), digestIndex()]);
  const latest = digests[0];
  console.log(`${bold('Status')}
bridge: ${bridge.connected ? 'connected' : 'not connected'}${bridge.mode ? ` (${bridge.mode})` : ''}
latest digest: ${latest ? `${latest.date} · ${latest.sourceCount} items` : 'none'}
source: ${sourceDefault}`);
  if (bridge.error) console.log(`bridge error: ${bridge.error}`);
}

async function promptForRun(rl, defaultDay = today(), defaultSource = sourceDefault) {
  const day = (await rl.question(`date [${defaultDay}]: `)).trim() || defaultDay;
  return { day, source: defaultSource };
}

async function guidedPrompt(day, source) {
  const daily = await readFile(path.join(root, 'prompts', 'daily-twitter.md'), 'utf8');
  const raw = path.join(root, 'data', 'raw', `${day}.json`);
  const digest = path.join(root, 'data', 'digests', `${day}.json`);
  const context = path.join(root, 'data', 'context', `${day}.json`);
  const guidance = process.env.TWEET_GUIDANCE_PATH || path.resolve(root, '..', 'poaster-app', 'sandbox-runtime', 'tweet-guidance.md');
  const replyGuidance = process.env.REPLY_GUIDANCE_PATH || path.resolve(root, '..', 'poaster-app', 'sandbox-runtime', 'reply-guidance.md');
  const suggestions = path.join(root, 'data', 'suggestions', `${day}-suggestions.json`);
  const reviewDir = path.join(root, 'data', 'reviews');
  const state = path.join(root, 'data', 'state.json');
  return `You are the interactive Twitter Daily runner.

Do not start scraping yet. First wait for the user to run these slash commands in this same Pi session:

/chrome doctor
/chrome authorize indefinite
/chrome background on

After the user says "run daily scrape", run the daily digest using this config:
- workflow: timeline
- date: ${day}
- source: ${source}
- raw output path: ${raw}
- digest output path: ${digest}
- context output path: ${context}
- guidance file path: ${guidance}
- reply guidance file path: ${replyGuidance}
- suggestions output path: ${suggestions}
- review data dir path: ${reviewDir}
- target tweet URL: none
- state file path: ${state}

After writing the digest, tell the user to exit this Pi session so the CLI can render the page.

${daily}`;
}

async function guidedRun(day = today(), source = sourceDefault) {
  await mkdir(path.join(root, 'data', 'raw'), { recursive: true });
  await mkdir(path.join(root, 'data', 'digests'), { recursive: true });
  await mkdir(path.join(root, 'data', 'context'), { recursive: true });
  await mkdir(path.join(root, 'data', 'suggestions'), { recursive: true });
  await mkdir(path.join(root, '.runs'), { recursive: true });
  console.log(`${bold('Guided run')}
In the Pi session that opens, run:
  /chrome doctor
  /chrome authorize indefinite
  /chrome background on

Then type: run daily scrape
Exit Pi when it finishes; this CLI will render the page.`);
  const code = await run('pi', ['--name', `twitter-daily-${day}`, await guidedPrompt(day, source)], {
    cwd: path.dirname(root),
    env: { ...process.env, TWITTER_DAILY_SOURCE: source },
  });
  const digest = path.join(root, 'data', 'digests', `${day}.json`);
  const exists = await stat(digest).then((s) => s.size > 0).catch(() => false);
  if (exists) await render();
  else console.log(`No digest at ${digest}; skipped render.`);
  return code;
}

async function headlessRun(day = today(), source = sourceDefault) {
  return run(path.join(root, 'bin', 'run-daily.sh'), [day], { env: { ...process.env, TWITTER_DAILY_SOURCE: source } });
}

async function auth() {
  return run('npm', ['run', 'auth']);
}

async function render() {
  return run(process.execPath, [path.join(root, 'scripts', 'render.mjs'), root]);
}

async function menu() {
  await printStatus();
  const rl = readline.createInterface({ input, output });
  try {
    while (true) {
      console.log(`\n${bold('Menu')}
1) guided run (recommended)
2) headless run
3) open Chrome auth helper
4) render page
5) status
q) quit`);
      const choice = (await rl.question('> ')).trim().toLowerCase();
      if (choice === 'q' || choice === 'quit' || choice === '') return 0;
      if (choice === '1') {
        const opts = await promptForRun(rl);
        rl.pause();
        await guidedRun(opts.day, opts.source);
        rl.resume();
      } else if (choice === '2') {
        const opts = await promptForRun(rl);
        rl.pause();
        await headlessRun(opts.day, opts.source);
        rl.resume();
      } else if (choice === '3') await auth();
      else if (choice === '4') await render();
      else if (choice === '5') await printStatus();
      else console.log('Pick 1-5 or q.');
    }
  } finally {
    rl.close();
  }
}

const [command, maybeDay] = process.argv.slice(2);
let exitCode = 0;
if (!command) exitCode = await menu();
else if (command === '--help' || command === '-h' || command === 'help') usage();
else if (command === 'run') exitCode = await guidedRun(maybeDay || today());
else if (command === 'headless') exitCode = await headlessRun(maybeDay || today());
else if (command === 'auth') exitCode = await auth();
else if (command === 'render') exitCode = await render();
else if (command === 'status') await printStatus();
else {
  usage();
  exitCode = 1;
}
process.exit(exitCode);
