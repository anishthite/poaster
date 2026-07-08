import './styles.css';
import { buildTweetIntentUrl, countTweetChars, isTweetLengthOk, remainingTweetChars, tweetIdFromUrl } from './composer.js';
import { createAgentSession, startAgentSession, stopAgentSession, streamPiTurn } from './agent-api.js';

const app = document.querySelector('#app');

app.innerHTML = `
  <main class="shell">
    <section class="pane composer-pane" aria-label="Tweet composer">
      <header class="topbar">
        <div>
          <p class="eyebrow">Poaster</p>
          <h1>Draft a post</h1>
        </div>
        <span class="official-pill">uses X intent</span>
      </header>

      <article class="composer-card">
        <div class="avatar" aria-hidden="true">P</div>
        <div class="composer-body">
          <textarea id="draft" maxlength="560" placeholder="What is happening?!" aria-label="Post draft"></textarea>
          <div class="composer-tools" aria-label="Composer tools">
            <span>🌄</span><span>GIF</span><span>☷</span><span>☺</span><span>📍</span>
          </div>
          <div class="composer-actions">
            <span id="count" class="count">280</span>
            <button id="preview" type="button" class="ghost">Preview as tweeted</button>
            <a id="intent" class="post-button" target="_blank" rel="noopener">Post on X</a>
          </div>
        </div>
      </article>

      <section class="preview-stack" aria-label="Tweet preview">
        <div class="section-heading">
          <div>
            <p class="eyebrow">Preview</p>
            <h2>When tweeted</h2>
          </div>
          <input id="tweet-url" inputmode="url" placeholder="Paste real tweet URL for official embed" />
        </div>
        <div id="local-preview" class="tweet-card muted">Draft something, then preview it here.</div>
        <div id="embed-status" class="embed-status"></div>
        <div id="tweet-embed" class="tweet-embed"></div>
      </section>
    </section>

    <aside class="pane agent-pane" aria-label="AI agent">
      <header class="topbar">
        <div>
          <p class="eyebrow">Cloudflare Sandbox</p>
          <h1>Agent</h1>
        </div>
        <span id="agent-status" class="status-dot">idle</span>
      </header>

      <div id="transcript" class="transcript" aria-live="polite">
        <div class="message assistant">Ask me for punchier wording, variants, hooks, or implementation help. I start a Cloudflare Sandbox on demand.</div>
      </div>

      <form id="agent-form" class="agent-form">
        <textarea id="agent-input" rows="3" placeholder="Help me improve this post…"></textarea>
        <div class="agent-actions">
          <button id="start-agent" type="button" class="ghost">start sandbox</button>
          <button id="stop-agent" type="button" class="ghost">stop</button>
          <button id="send-agent" type="submit" class="post-button">send</button>
        </div>
      </form>
    </aside>
  </main>
`;

const refs = {
  draft: document.querySelector('#draft'),
  count: document.querySelector('#count'),
  intent: document.querySelector('#intent'),
  preview: document.querySelector('#preview'),
  localPreview: document.querySelector('#local-preview'),
  tweetUrl: document.querySelector('#tweet-url'),
  tweetEmbed: document.querySelector('#tweet-embed'),
  embedStatus: document.querySelector('#embed-status'),
  status: document.querySelector('#agent-status'),
  transcript: document.querySelector('#transcript'),
  form: document.querySelector('#agent-form'),
  input: document.querySelector('#agent-input'),
  start: document.querySelector('#start-agent'),
  stop: document.querySelector('#stop-agent'),
  send: document.querySelector('#send-agent'),
};

let session = null;
let postedPreview = '';
let assistantNode = null;

refs.draft.addEventListener('input', renderDraftState);
refs.preview.addEventListener('click', () => {
  postedPreview = refs.draft.value.trim();
  renderPostedPreview();
});
refs.tweetUrl.addEventListener('input', renderTweetEmbed);
refs.start.addEventListener('click', () => withStatus('starting…', ensureSession));
refs.stop.addEventListener('click', stopSession);
refs.form.addEventListener('submit', sendAgentMessage);

renderDraftState();
renderPostedPreview();

function renderDraftState() {
  const draft = refs.draft.value;
  const left = remainingTweetChars(draft);
  refs.count.textContent = String(left);
  refs.count.classList.toggle('bad', left < 0);
  refs.intent.href = buildTweetIntentUrl(draft);
  refs.intent.classList.toggle('disabled', !isTweetLengthOk(draft));
  refs.preview.disabled = !draft.trim();
}

function renderPostedPreview() {
  if (!postedPreview) {
    refs.localPreview.className = 'tweet-card muted';
    refs.localPreview.textContent = 'Draft something, then preview it here.';
    return;
  }
  refs.localPreview.className = 'tweet-card';
  refs.localPreview.innerHTML = `
    <div class="tweet-head"><div class="avatar small">P</div><div><strong>Poaster</strong><span>@poaster · now</span></div></div>
    <p>${escapeHtml(postedPreview)}</p>
    <div class="tweet-metrics"><span>↩ 0</span><span>↻ 0</span><span>♡ 0</span><span>↗</span></div>
  `;
}

async function renderTweetEmbed() {
  const value = refs.tweetUrl.value.trim();
  refs.tweetEmbed.innerHTML = '';
  refs.embedStatus.textContent = '';
  if (!value) return;
  if (!tweetIdFromUrl(value)) {
    refs.embedStatus.textContent = 'Paste a public x.com/twitter.com status URL.';
    return;
  }
  refs.embedStatus.textContent = 'Loading official X embed…';
  refs.tweetEmbed.innerHTML = `<blockquote class="twitter-tweet"><a href="${escapeAttr(value)}"></a></blockquote>`;
  try {
    await loadTwitterWidgets();
    window.twttr?.widgets?.load(refs.tweetEmbed);
    refs.embedStatus.textContent = 'Official embed requested.';
  } catch (err) {
    refs.embedStatus.textContent = `Could not load X widgets: ${err.message}`;
  }
}

async function ensureSession() {
  if (!session) session = await createAgentSession('Poaster draft');
  else session = await startAgentSession(session.id);
  setStatus(session.status === 'ready' ? 'ready' : session.errorMessage || session.status);
  return session;
}

async function stopSession() {
  if (!session) return setStatus('idle');
  try {
    session = await stopAgentSession(session.id);
    setStatus('stopped');
  } catch (err) {
    setStatus(err.message);
  }
}

async function sendAgentMessage(event) {
  event.preventDefault();
  const message = refs.input.value.trim();
  if (!message) return;
  refs.input.value = '';
  refs.send.disabled = true;
  appendMessage('user', message);
  assistantNode = appendMessage('assistant', '');
  try {
    const live = await ensureSession();
    await streamPiTurn(live.id, {
      message,
      draft: refs.draft.value,
      postedPreview,
      tweetUrl: refs.tweetUrl.value.trim(),
    }, handleAgentEvent);
  } catch (err) {
    appendAssistantText(`\nError: ${err.message}`);
    setStatus('error');
  } finally {
    refs.send.disabled = false;
    assistantNode = null;
  }
}

function handleAgentEvent(event) {
  if (event.type === 'status') setStatus(event.message || 'running');
  else if (event.type === 'stdout') appendAssistantText(event.text || '');
  else if (event.type === 'stderr') setStatus('sandbox stderr');
  else if (event.type === 'done') {
    if (event.answer && assistantNode && !assistantNode.textContent.trim()) assistantNode.textContent = event.answer;
    setStatus('ready');
  } else if (event.type === 'error') {
    appendAssistantText(`\nError: ${event.message || 'unknown error'}`);
    setStatus('error');
  }
}

function appendMessage(role, text) {
  const node = document.createElement('div');
  node.className = `message ${role}`;
  node.textContent = text;
  refs.transcript.append(node);
  refs.transcript.scrollTop = refs.transcript.scrollHeight;
  return node;
}

function appendAssistantText(text) {
  if (!assistantNode) assistantNode = appendMessage('assistant', '');
  assistantNode.textContent += text;
  refs.transcript.scrollTop = refs.transcript.scrollHeight;
}

async function withStatus(label, fn) {
  setStatus(label);
  try { return await fn(); } catch (err) { setStatus(err.message); throw err; }
}

function setStatus(text) {
  refs.status.textContent = text;
}

function loadTwitterWidgets() {
  if (window.twttr?.widgets) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const existing = document.querySelector('script[src="https://platform.twitter.com/widgets.js"]');
    if (existing) {
      existing.addEventListener('load', resolve, { once: true });
      existing.addEventListener('error', () => reject(new Error('widgets.js failed')), { once: true });
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://platform.twitter.com/widgets.js';
    script.async = true;
    script.onload = resolve;
    script.onerror = () => reject(new Error('widgets.js failed'));
    document.head.append(script);
  });
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
}

function escapeAttr(value) {
  return escapeHtml(value).replace(/'/g, '&#39;');
}

if (!('ReadableStream' in window)) setStatus('browser lacks streams');
console.info('Poaster loaded', { maxChars: countTweetChars('x'.repeat(280)) });
