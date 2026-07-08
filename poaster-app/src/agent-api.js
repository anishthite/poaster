export async function createAgentSession(title = 'Poaster draft') {
  const res = await fetch('/api/agent/sessions', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ title }),
  });
  const body = await readJson(res);
  if (!res.ok) throw new Error(body.error || `session create failed: ${res.status}`);
  return body.session;
}

export async function startAgentSession(id) {
  const res = await fetch(`/api/agent/sessions/${encodeURIComponent(id)}/start`, { method: 'POST' });
  const body = await readJson(res);
  if (!res.ok) throw new Error(body.error || `session start failed: ${res.status}`);
  return body.session;
}

export async function stopAgentSession(id) {
  const res = await fetch(`/api/agent/sessions/${encodeURIComponent(id)}/stop`, { method: 'POST' });
  const body = await readJson(res);
  if (!res.ok) throw new Error(body.error || `session stop failed: ${res.status}`);
  return body.session;
}

export async function deleteAgentSession(id) {
  const res = await fetch(`/api/agent/sessions/${encodeURIComponent(id)}`, { method: 'DELETE' });
  const body = await readJson(res);
  if (!res.ok) throw new Error(body.error || `session delete failed: ${res.status}`);
  return body.session;
}

export async function streamPiTurn(id, input, onEvent, opts = {}) {
  const res = await fetch(`/api/agent/sessions/${encodeURIComponent(id)}/pi/stream`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'text/event-stream' },
    body: JSON.stringify(input),
    signal: opts.signal,
  });
  if (!res.ok || !res.body) {
    const body = await readJson(res).catch(() => ({}));
    throw new Error(body.error || `stream failed: ${res.status}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let answer = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const parsed = drainSse(buffer);
    buffer = parsed.rest;
    for (const event of parsed.events) {
      if (event.type === 'stdout') answer += event.text || '';
      if (event.type === 'done' && typeof event.answer === 'string') answer = event.answer;
      onEvent(event);
    }
  }
  return { answer };
}

function drainSse(buffer) {
  const events = [];
  let rest = buffer;
  let boundary = rest.indexOf('\n\n');
  while (boundary >= 0) {
    const frame = rest.slice(0, boundary);
    rest = rest.slice(boundary + 2);
    const data = frame
      .split('\n')
      .filter((line) => line.startsWith('data:'))
      .map((line) => line.slice(5).trimStart())
      .join('\n');
    if (data) {
      try { events.push(JSON.parse(data)); } catch { events.push({ type: 'raw', text: data }); }
    }
    boundary = rest.indexOf('\n\n');
  }
  return { events, rest };
}

async function readJson(res) {
  const text = await res.text();
  return text ? JSON.parse(text) : {};
}
