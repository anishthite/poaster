import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import path from 'node:path';

const [rootArg, day, source] = process.argv.slice(2);
if (!rootArg || !day || !source) throw new Error('usage: run-pi.mjs <root> <day> <source>');

const root = path.resolve(rootArg);
const raw = path.join(root, 'data', 'raw', `${day}.json`);
const digest = path.join(root, 'data', 'digests', `${day}.json`);
const context = path.join(root, 'data', 'context', `${day}.json`);
const guidance = process.env.TWEET_GUIDANCE_PATH || path.resolve(root, '..', 'poaster-app', 'sandbox-runtime', 'tweet-guidance.md');
const replyGuidance = process.env.REPLY_GUIDANCE_PATH || path.resolve(root, '..', 'poaster-app', 'sandbox-runtime', 'reply-guidance.md');
const suggestions = path.join(root, 'data', 'suggestions', `${day}-suggestions.json`);
const reviewDir = path.join(root, 'data', 'reviews');
const state = path.join(root, 'data', 'state.json');
const log = path.join(root, '.runs', `${day}.pi.txt`);
const prompt = `${await readFile(path.join(root, 'prompts', 'daily-twitter.md'), 'utf8')}

Run config:
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
`;

await mkdir(path.dirname(log), { recursive: true });
await writeFile(log, '');

const child = spawn('pi', ['--name', `twitter-daily-${day}`, '-p', prompt], {
  cwd: path.dirname(root),
  stdio: ['ignore', 'pipe', 'pipe'],
});

let authRequired = false;
let timedOut = false;
const timeout = setTimeout(() => {
  timedOut = true;
  child.kill('SIGTERM');
}, Number(process.env.PI_DAILY_TIMEOUT_MS || 600_000));

async function stream(chunk, dest) {
  const text = chunk.toString();
  process[dest].write(text);
  await writeFile(log, text, { flag: 'a' });
  if (/\/chrome authorize|not authorized/i.test(text)) {
    authRequired = true;
    child.kill('SIGTERM');
  }
}

child.stdout.on('data', (chunk) => void stream(chunk, 'stdout'));
child.stderr.on('data', (chunk) => void stream(chunk, 'stderr'));

child.on('error', (error) => {
  clearTimeout(timeout);
  console.error(error.message);
  process.exit(127);
});

child.on('close', (code, signal) => {
  clearTimeout(timeout);
  if (authRequired) {
    console.error('\nChrome authorization required. Run `npm run auth`, then `/chrome authorize indefinite` in that Pi session.');
    process.exit(42);
  }
  if (timedOut || code === 143) {
    console.error('\nPi run timed out before writing a digest. Try `npm run auth`, then `/chrome authorize indefinite` in that Pi session.');
    process.exit(1);
  }
  if (signal) {
    console.error(`\nPi run stopped by ${signal}.`);
    process.exit(1);
  }
  process.exit(code ?? 1);
});
