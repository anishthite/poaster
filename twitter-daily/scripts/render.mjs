import { mkdir, readdir, readFile, writeFile, copyFile, stat } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(process.argv[2] || process.cwd());
const digestDir = path.join(root, 'data', 'digests');
const contextDir = path.join(root, 'data', 'context');
const suggestionDir = path.join(root, 'data', 'suggestions');
const publicDir = path.join(root, 'public');
const publicDigestDir = path.join(publicDir, 'digests');
const publicContextDir = path.join(publicDir, 'context');
const publicSuggestionDir = path.join(publicDir, 'suggestions');

const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (ch) => ({
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
})[ch]);

const asArray = (value) => Array.isArray(value) ? value : [];
const workflowName = (digest) => ({ timeline: 'Timeline + replies' })[digest?.workflow] || 'Timeline + replies';

async function loadJsonDir(dir) {
  await mkdir(dir, { recursive: true });
  const files = (await readdir(dir)).filter((file) => file.endsWith('.json'));
  const items = [];
  for (const file of files) {
    const fullPath = path.join(dir, file);
    const item = JSON.parse(await readFile(fullPath, 'utf8'));
    item.file = file;
    item.mtimeMs = (await stat(fullPath)).mtimeMs;
    items.push(item);
  }
  return items.sort((a, b) => b.mtimeMs - a.mtimeMs || b.file.localeCompare(a.file));
}

function renderLearning(learning) {
  const title = typeof learning === 'string' ? learning : learning.title;
  const detail = typeof learning === 'string' ? '' : learning.detail;
  const urls = typeof learning === 'string' ? [] : asArray(learning.evidenceUrls);
  const links = urls.map((url) => `<a href="${esc(url)}">evidence</a>`).join(' · ');
  return `<li><strong>${esc(title)}</strong>${detail ? `<p>${esc(detail)}</p>` : ''}${links ? `<small>${links}</small>` : ''}</li>`;
}

function renderSuggestion(item) {
  const text = item.text || item.draft || '';
  const kind = item.kind || item.type || 'post';
  const why = item.why || item.note || '';
  const urls = asArray(item.evidenceUrls);
  const links = urls.map((url) => `<a href="${esc(url)}">source</a>`).join(' · ');
  return `<li><strong>${esc(kind)}</strong><p>${esc(text)}</p>${why ? `<p><em>${esc(why)}</em></p>` : ''}${links ? `<small>${links}</small>` : ''}</li>`;
}

function renderTweetSource(url) {
  if (!url) return '<p class="empty">No source tweet URL.</p>';
  return `<div class="tweet-source"><blockquote class="twitter-tweet" data-dnt="true"><a href="${esc(url)}"></a></blockquote><p><a href="${esc(url)}" target="_blank" rel="noreferrer">Open source tweet</a></p></div>`;
}

function renderReviewCard(item, index, file) {
  const text = item.text || item.draft || '';
  const kind = item.kind || item.type || 'post';
  const why = item.why || item.note || '';
  const sourceUrl = asArray(item.evidenceUrls)[0] || '';
  return `<article class="review-card" data-review-card data-suggestion-file="${esc(file)}" data-suggestion-index="${esc(index)}">
    ${renderTweetSource(sourceUrl)}
    <div class="draft-review"><small>Suggested ${esc(kind)}</small><pre>${esc(text)}</pre>${why ? `<p><em>${esc(why)}</em></p>` : ''}</div>
    <label>Why?<textarea data-review-note rows="2" placeholder="What worked or what missed?"></textarea></label>
    <div class="review-actions"><button type="button" data-review-decision="approve">Approve</button><button type="button" class="secondary" data-review-decision="deny">Deny</button></div>
    <p class="review-status" data-review-status>Not reviewed yet.</p>
  </article>`;
}

function renderHtml(digests, contexts, suggestions) {
  const latest = digests[0];
  const digestList = digests.map((digest) => `<li><a href="digests/${esc(digest.file)}">${esc(digest.date || digest.file.replace(/\.json$/, ''))}</a> · ${esc(workflowName(digest))} · ${esc(digest.sourceCount ?? 0)} items</li>`).join('\n');
  const body = latest ? `
    <section class="hero">
      <p class="eyebrow">Latest digest</p>
      <h1>${esc(latest.date)}</h1>
      <p>${esc(workflowName(latest))} · ${esc(latest.sourceCount ?? 0)} tweets · ${esc(latest.replyCount ?? 0)} replies</p>
    </section>
    <section>
      <h2>Learnings</h2>
      <ol>${asArray(latest.learnings).map(renderLearning).join('\n')}</ol>
    </section>
    <section>
      <h2>Topics</h2>
      <p>${asArray(latest.topics).map((topic) => `<span>${esc(topic)}</span>`).join(' ') || 'No topics yet.'}</p>
    </section>
    <section>
      <h2>Follow-ups</h2>
      <ul>${asArray(latest.followUps).map((item) => `<li>${esc(item)}</li>`).join('\n')}</ul>
    </section>` : `<section class="hero"><h1>No digests yet</h1><p>Run <code>npm run serve</code>.</p></section>`;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Twitter Daily</title>
<style>
  body { margin: 0; font: 16px/1.5 system-ui, -apple-system, sans-serif; color: #0f172a; background: #f8fafc; }
  main { max-width: 880px; margin: 0 auto; padding: 32px 18px 56px; }
  section { background: white; border: 1px solid #e2e8f0; border-radius: 18px; padding: 20px; margin: 16px 0; box-shadow: 0 8px 24px rgb(15 23 42 / 5%); }
  .hero { background: #0f172a; color: white; }
  .eyebrow, small { color: #64748b; }
  .hero .eyebrow { color: #cbd5e1; text-transform: uppercase; letter-spacing: .08em; font-size: 12px; }
  h1, h2, p { margin-top: 0; }
  li { margin: 10px 0; }
  li p { margin: 4px 0; }
  span { display: inline-block; margin: 0 8px 8px 0; padding: 4px 10px; border-radius: 999px; background: #e0f2fe; color: #075985; }
  a { color: #2563eb; }
  nav ul { padding-left: 20px; }
  .controls button { appearance: none; border: 0; border-radius: 999px; padding: 10px 14px; margin: 0 8px 8px 0; background: #0f172a; color: white; font: inherit; cursor: pointer; }
  .controls button.secondary { background: #e2e8f0; color: #0f172a; }
  .workflow-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 10px; margin: 12px 0; }
  .workflow-grid div { border: 1px solid #e2e8f0; border-radius: 14px; padding: 12px; }
  .workflow-grid p { margin: 6px 0 0; font-size: 13px; color: #475569; }
  .controls pre, .run-log { white-space: pre-wrap; background: #f1f5f9; padding: 12px; border-radius: 12px; overflow-x: auto; }
  .run-log { max-height: 420px; overflow-y: auto; font-size: 13px; }
  .review-list { display: grid; gap: 14px; }
  .review-card { border: 1px solid #e2e8f0; border-radius: 14px; padding: 14px; background: #f8fafc; }
  .tweet-source { background: white; border: 1px solid #e2e8f0; border-radius: 12px; padding: 10px; margin-bottom: 10px; }
  .draft-review pre { white-space: pre-wrap; margin: 6px 0; font: inherit; background: white; border-radius: 12px; padding: 12px; }
  .review-card textarea { box-sizing: border-box; width: 100%; margin-top: 6px; border: 1px solid #cbd5e1; border-radius: 10px; padding: 10px; font: inherit; }
  .review-actions button { appearance: none; border: 0; border-radius: 999px; padding: 8px 12px; margin: 8px 8px 0 0; background: #16a34a; color: white; font: inherit; cursor: pointer; }
  .review-actions button.secondary { background: #dc2626; color: white; }
  .review-status { color: #64748b; font-size: 13px; margin: 8px 0 0; }
  .review-status[data-decision="approve"] { color: #15803d; }
  .review-status[data-decision="deny"] { color: #b91c1c; }
  .empty { color: #64748b; }
</style>
</head>
<body>
<main>
<section class="controls">
  <h2>Run controls</h2>
  <p>Use <code>npm run serve</code>, then authorize and run through the embedded Pi SDK session.</p>
  <button id="authButton">Authorize Chrome</button>
  <button id="connectorButton" class="secondary">Open connector reload</button>
  <button id="statusButton" class="secondary">Refresh status</button>
  <h3>Timeline scrape</h3>
  <div class="workflow-grid">
    <div><button data-workflow="timeline">Scrape timeline + replies</button><p>Collect home timeline tweets, then store the first 3 visible replies for each tweet.</p></div>
  </div>
  <pre id="controlStatus">Checking local server…</pre>
</section>
<section>
  <h2>SDK runner log</h2>
  <p>This mirrors <code>.runs/web-run-latest.log</code>. Watch SDK output/errors here.</p>
  <pre id="runLog" class="run-log">No run log yet.</pre>
</section>
${body}
<nav>
  <h2>History</h2>
  <ul>${digestList || '<li>No history yet.</li>'}</ul>
</nav>
</main>
<script async src="https://platform.twitter.com/widgets.js" charset="utf-8"></script>
<script>
window.TWITTER_DAILY_TOKEN = '__TWITTER_DAILY_TOKEN__';
const statusEl = document.getElementById('controlStatus');
const runLogEl = document.getElementById('runLog');
const authButton = document.getElementById('authButton');
const connectorButton = document.getElementById('connectorButton');
const statusButton = document.getElementById('statusButton');
const workflowButtons = Array.from(document.querySelectorAll('[data-workflow]'));
const reviewCards = Array.from(document.querySelectorAll('[data-review-card]'));
async function api(path, options) {
  const res = await fetch(path, Object.assign({}, options, { headers: Object.assign({ 'x-twitter-daily-token': window.TWITTER_DAILY_TOKEN }, options && options.headers) }));
  const data = await res.json().catch(() => ({ error: 'bad JSON response' }));
  if (!res.ok) throw new Error(data.error || res.statusText);
  return data;
}
async function refreshStatus() {
  try {
    const data = await api('/api/status');
    const bridge = data.bridge || {};
    const latest = (data.digests || [])[0];
    statusEl.textContent = [
      'bridge: ' + (bridge.connected ? 'connected' : 'not connected'),
      'bridge mode: ' + (bridge.mode || 'unknown'),
      'latest digest: ' + (latest ? latest.date + ' · ' + (latest.workflow || 'timeline') + ' · ' + latest.sourceCount + ' items' : 'none'),
      'sdk: ' + (data.sdk && data.sdk.ready ? 'ready' : 'not started') + (data.sdk && data.sdk.authorized ? ' · authorized' : ''),
      'run: ' + (data.running && !data.running.done ? 'running ' + (data.running.label || data.running.workflow || data.running.mode) : data.running && data.running.error ? 'error: ' + data.running.error : 'idle')
    ].join('\\n');
  } catch (error) {
    statusEl.textContent = 'Control server unavailable. Start it with: npm run serve\\n' + error.message;
  }
}
async function refreshLog() {
  try {
    const data = await api('/api/log');
    runLogEl.textContent = data.log || 'No run log yet.';
    runLogEl.scrollTop = runLogEl.scrollHeight;
  } catch (error) {
    runLogEl.textContent = 'Log unavailable. Start server with: npm run serve\\n' + error.message;
  }
}
authButton.addEventListener('click', async () => {
  try {
    const data = await api('/api/authorize', { method: 'POST' });
    statusEl.textContent = data.message;
  } catch (error) { statusEl.textContent = error.message; }
});
async function runWorkflow(workflow) {
  try {
    const data = await api('/api/run', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ workflow }) });
    statusEl.textContent = data.message || 'Started SDK runner.';
    setTimeout(refreshStatus, 1500);
    setTimeout(refreshLog, 1500);
  } catch (error) { statusEl.textContent = error.message; }
}
workflowButtons.forEach((button) => button.addEventListener('click', () => runWorkflow(button.dataset.workflow)));
function applyReview(card, review) {
  if (!review) return;
  const note = card.querySelector('[data-review-note]');
  const status = card.querySelector('[data-review-status]');
  if (note && document.activeElement !== note) note.value = review.note || '';
  status.dataset.decision = review.decision;
  status.textContent = (review.decision === 'approve' ? 'Approved' : 'Denied') + (review.note ? ': ' + review.note : '');
}
async function loadReviewCards() {
  for (const file of [...new Set(reviewCards.map((card) => card.dataset.suggestionFile))]) {
    try {
      const data = await api('/api/reviews?file=' + encodeURIComponent(file));
      const byId = new Map((data.reviews || []).map((review) => [review.id, review]));
      reviewCards.filter((card) => card.dataset.suggestionFile === file).forEach((card) => applyReview(card, byId.get(file + '#' + card.dataset.suggestionIndex)));
    } catch (error) {
      reviewCards.filter((card) => card.dataset.suggestionFile === file).forEach((card) => { card.querySelector('[data-review-status]').textContent = 'Review status unavailable: ' + error.message; });
    }
  }
}
async function saveReview(card, decision) {
  const buttons = Array.from(card.querySelectorAll('[data-review-decision]'));
  const status = card.querySelector('[data-review-status]');
  buttons.forEach((button) => { button.disabled = true; });
  status.textContent = 'Saving…';
  try {
    const data = await api('/api/reviews', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({
      suggestionFile: card.dataset.suggestionFile,
      suggestionIndex: Number(card.dataset.suggestionIndex),
      decision,
      note: card.querySelector('[data-review-note]').value,
    }) });
    applyReview(card, data.review);
  } catch (error) {
    status.textContent = 'Save failed: ' + error.message;
  } finally {
    buttons.forEach((button) => { button.disabled = false; });
  }
}
reviewCards.forEach((card) => card.addEventListener('click', (event) => {
  const button = event.target.closest?.('[data-review-decision]');
  if (button) saveReview(card, button.dataset.reviewDecision);
}));
connectorButton.addEventListener('click', async () => {
  try {
    const data = await api('/api/open-connector', { method: 'POST' });
    statusEl.textContent = data.message;
  } catch (error) { statusEl.textContent = error.message; }
});
statusButton.addEventListener('click', () => { refreshStatus(); refreshLog(); });
refreshStatus();
refreshLog();
loadReviewCards();
setInterval(refreshStatus, 5000);
setInterval(refreshLog, 1500);
</script>
</body>
</html>
`;
}

const digests = await loadJsonDir(digestDir);
const contexts = await loadJsonDir(contextDir);
const suggestions = await loadJsonDir(suggestionDir);
await mkdir(publicDigestDir, { recursive: true });
await mkdir(publicContextDir, { recursive: true });
await mkdir(publicSuggestionDir, { recursive: true });
for (const digest of digests) {
  await copyFile(path.join(digestDir, digest.file), path.join(publicDigestDir, digest.file));
}
for (const context of contexts) {
  await copyFile(path.join(contextDir, context.file), path.join(publicContextDir, context.file));
}
for (const suggestion of suggestions) {
  await copyFile(path.join(suggestionDir, suggestion.file), path.join(publicSuggestionDir, suggestion.file));
}
await writeFile(path.join(publicDigestDir, 'index.json'), JSON.stringify(digests.map(({ file, date, workflow, sourceCount }) => ({ file, date, workflow, sourceCount })), null, 2));
await writeFile(path.join(publicContextDir, 'index.json'), JSON.stringify(contexts.map(({ file, date, learnings }) => ({ file, date, learningCount: asArray(learnings).length })), null, 2));
await writeFile(path.join(publicSuggestionDir, 'index.json'), JSON.stringify(suggestions.map(({ file, date, items, suggestions: drafts }) => ({ file, date, suggestionCount: asArray(items || drafts).length })), null, 2));
await writeFile(path.join(publicDir, 'index.html'), renderHtml(digests, contexts, suggestions));
console.log(`rendered ${digests.length} digest(s), ${contexts.length} context pack(s), ${suggestions.length} suggestion batch(es)`);
