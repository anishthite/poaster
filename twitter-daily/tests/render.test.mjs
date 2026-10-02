import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, utimes } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const root = await mkdtemp(path.join(tmpdir(), 'twitter-daily-'));
await mkdir(path.join(root, 'data', 'digests'), { recursive: true });
await mkdir(path.join(root, 'data', 'context'), { recursive: true });
await mkdir(path.join(root, 'data', 'suggestions'), { recursive: true });

const oldDigest = path.join(root, 'data', 'digests', '2026-07-08.json');
const timelineDigest = path.join(root, 'data', 'digests', '2026-07-09-timeline.json');
await writeFile(oldDigest, JSON.stringify({
  date: '2026-07-08',
  workflow: 'timeline',
  sourceCount: 1,
  replyCount: 1,
  learnings: ['older'],
  topics: ['old'],
  followUps: ['wait'],
}));
await writeFile(timelineDigest, JSON.stringify({
  date: '2026-07-09',
  workflow: 'timeline',
  source: 'home-timeline-with-replies',
  sourceCount: 2,
  replyCount: 6,
  learnings: [{ title: '<new>', detail: 'escaped & cited', evidenceUrls: ['https://x.com/a/status/1'] }],
  topics: ['shipping'],
  followUps: ['do less'],
}));
await utimes(oldDigest, new Date('2026-07-08T00:00:00Z'), new Date('2026-07-08T00:00:00Z'));
await utimes(timelineDigest, new Date('2026-07-09T00:01:00Z'), new Date('2026-07-09T00:01:00Z'));

const script = path.resolve('scripts/render.mjs');
const result = spawnSync(process.execPath, [script, root], { cwd: process.cwd(), encoding: 'utf8' });
assert.equal(result.status, 0, result.error?.message || result.stderr || result.stdout);

const cli = spawnSync(process.execPath, [path.resolve('scripts/cli.mjs'), '--help'], { cwd: process.cwd(), encoding: 'utf8' });
assert.equal(cli.status, 0, cli.error?.message || cli.stderr || cli.stdout);
assert.match(cli.stdout, /guided same-session Pi run/);
assert.match(cli.stdout, /home-timeline-with-replies/);

const serverCheck = spawnSync(process.execPath, ['--check', path.resolve('scripts/server.mjs')], { cwd: process.cwd(), encoding: 'utf8' });
assert.equal(serverCheck.status, 0, serverCheck.error?.message || serverCheck.stderr || serverCheck.stdout);

const html = await readFile(path.join(root, 'public', 'index.html'), 'utf8');
const prompt = await readFile(path.resolve('prompts/daily-twitter.md'), 'utf8');
const index = JSON.parse(await readFile(path.join(root, 'public', 'digests', 'index.json'), 'utf8'));

assert.match(prompt, /first 3 visible replies/i);
assert.match(prompt, /home-timeline-with-replies/);
assert.match(prompt, /Store this for each timeline tweet/);
assert.match(prompt, /Store this for each reply/);
assert.match(prompt, /`replies`/);
assert.match(prompt, /`replyIndex`/);
assert.match(prompt, /do not use `chrome_scroll`/i);
assert.match(prompt, /window\.scrollBy/);
assert.match(prompt, /small and synchronous/);
assert.match(prompt, /visible counts only/);
assert.match(prompt, /state file/);
assert.match(html, /2026-07-09/);
assert.match(html, /Timeline \+ replies/);
assert.match(html, /2 tweets · 6 replies/);
assert.match(html, /Scrape timeline \+ replies/);
assert.match(html, /first 3 visible replies/);
assert.match(html, /data-workflow="timeline"/);
assert.doesNotMatch(html, /Generate post\/reply drafts/);
assert.doesNotMatch(html, /Learn good replies/);
assert.match(html, /&lt;new&gt;/);
assert.match(html, /Authorize Chrome/);
assert.match(html, /Open connector reload/);
assert.match(html, /SDK runner log/);
assert.match(html, /npm run serve/);
new Function(html.match(/<script>([\s\S]*)<\/script>/)[1]);
assert.equal(index[0].date, '2026-07-09');
assert.equal(index[0].workflow, 'timeline');
assert.equal(index[1].date, '2026-07-08');
