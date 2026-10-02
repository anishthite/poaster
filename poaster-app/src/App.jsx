import { useEffect, useMemo, useRef, useState } from 'react';
import {
  BarChart3,
  BadgeCheck,
  Heart,
  MessageCircle,
  MoreHorizontal,
  Repeat2,
  Send,
  Upload,
} from 'lucide-react';
import { createAgentSession, startAgentSession, stopAgentSession, streamPiTurn } from './agent-api.js';
import { buildTweetIntentUrl, getSuggestedAgentPrompts, isTweetLengthOk, remainingTweetChars } from './composer.js';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';

const AGENT_STORE_KEY = 'poaster:agentConversations:v1';
const AGENT_ACTIVE_KEY = 'poaster:agentActiveConversation:v1';
const AGENT_AUTO_STOP_MS = 15 * 60 * 1000;
const MAX_STORED_TURNS = 80;

export function App() {
  const initial = useMemo(() => {
    const conversations = loadConversations();
    return { conversations, active: loadActiveConversation(conversations) };
  }, []);

  const [draft, setDraft] = useState('');
  const [conversations, setConversations] = useState(initial.conversations);
  const [activeConversation, setActiveConversation] = useState(initial.active);
  const [session, setSession] = useState(initial.active?.session || null);
  const [turns, setTurns] = useState(initial.active?.turns ? [...initial.active.turns] : []);
  const [status, setStatusState] = useState(statusFromSession(initial.active?.session, initial.active));
  const [inflight, setInflight] = useState(false);
  const [assistantDraft, setAssistantDraft] = useState(null);

  const conversationsRef = useRef(conversations);
  const activeRef = useRef(activeConversation);
  const sessionRef = useRef(session);
  const turnsRef = useRef(turns);
  const inflightRef = useRef(inflight);
  const streamControllerRef = useRef(null);
  const autoStopTimerRef = useRef(null);
  const transcriptRef = useRef(null);
  const agentMessageRef = useRef(null);

  useEffect(() => { conversationsRef.current = conversations; }, [conversations]);
  useEffect(() => { activeRef.current = activeConversation; }, [activeConversation]);
  useEffect(() => { sessionRef.current = session; }, [session]);
  useEffect(() => { turnsRef.current = turns; }, [turns]);
  useEffect(() => { inflightRef.current = inflight; }, [inflight]);
  useEffect(() => {
    transcriptRef.current?.scrollTo({ top: transcriptRef.current.scrollHeight });
  }, [turns, assistantDraft]);
  useEffect(() => {
    if (session?.status === 'ready') scheduleAutoStop();
    return clearAutoStop;
  }, []);

  const left = remainingTweetChars(draft);
  const canPost = Boolean(draft.trim() && isTweetLengthOk(draft));
  const messages = assistantDraft === null ? turns : [...turns, { role: 'assistant', content: assistantDraft }];
  const suggestedPrompts = getSuggestedAgentPrompts(draft);

  async function sendAgentMessage(event) {
    event.preventDefault();
    const message = event.currentTarget.elements.agentMessage.value.trim();
    if (!message || inflightRef.current) return;

    event.currentTarget.reset();
    setInflight(true);
    setAssistantDraft('');
    setStatus('starting…', 'starting');

    const active = ensureActiveConversation(message);
    const nextTurns = [...turnsRef.current, { role: 'user', content: message }];
    setTurns(nextTurns);
    saveConversation(active, nextTurns, sessionRef.current);

    let assistantText = '';
    try {
      const live = await ensureSession(message);
      streamControllerRef.current = new AbortController();
      const result = await streamPiTurn(live.id, {
        message,
        draft,
        postedPreview: draft.trim(),
        history: nextTurns.slice(0, -1).slice(-12),
      }, (agentEvent) => {
        if (agentEvent.type === 'status') setStatus(cleanStatus(agentEvent.message || 'running'), 'running');
        else if (agentEvent.type === 'stdout') {
          assistantText += agentEvent.text || '';
          setAssistantDraft(assistantText);
        } else if (agentEvent.type === 'stderr') setStatus('working…', 'running');
        else if (agentEvent.type === 'done') {
          assistantText = agentEvent.answer || assistantText;
          setAssistantDraft(assistantText);
        } else if (agentEvent.type === 'error') throw new Error(agentEvent.message || 'agent error');
      }, { signal: streamControllerRef.current.signal });

      const finalAnswer = (result?.answer || assistantText).trim();
      const finalTurns = finalAnswer ? [...turnsRef.current, { role: 'assistant', content: finalAnswer }] : turnsRef.current;
      setTurns(finalTurns);
      saveConversation(activeRef.current, finalTurns, sessionRef.current);
      setAssistantDraft(null);
      setStatus('ready', 'ready');
    } catch (err) {
      const aborted = err?.name === 'AbortError';
      const partial = assistantText.trim();
      const text = partial || (aborted ? 'Paused.' : `Error: ${cleanStatus(err.message || err)}`);
      const finalTurns = [...turnsRef.current, { role: 'assistant', content: text }];
      setTurns(finalTurns);
      saveConversation(activeRef.current, finalTurns, sessionRef.current);
      setAssistantDraft(null);
      setStatus(aborted ? 'paused' : 'error', aborted ? 'stopped' : 'error');
    } finally {
      setInflight(false);
      streamControllerRef.current = null;
      if (sessionRef.current?.status === 'ready') scheduleAutoStop();
    }
  }

  function ensureActiveConversation(seed) {
    if (activeRef.current) return activeRef.current;
    const active = {
      id: localConversationId(),
      title: compactTitle(seed || 'Poaster chat'),
      turns: [],
      session: null,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    activeRef.current = active;
    setActiveConversation(active);
    return active;
  }

  async function ensureSession(title) {
    if (sessionRef.current?.status === 'ready') return sessionRef.current;
    const current = sessionRef.current;
    const startingFresh = !current?.id;
    setStatus(startingFresh ? 'starting…' : 'resuming…', 'starting');
    const next = startingFresh
      ? await createAgentSession(compactTitle(title || 'Poaster chat'))
      : await startAgentSession(current.id);
    const live = { ...next, title: next.title || current?.title || compactTitle(title || 'Poaster chat') };
    if (live.status !== 'ready') throw new Error(live.errorMessage || `agent ${live.status}`);
    sessionRef.current = live;
    setSession(live);
    saveConversation(activeRef.current, turnsRef.current, live);
    setStatus('ready', 'ready');
    scheduleAutoStop();
    return live;
  }

  async function stopIdleSession() {
    autoStopTimerRef.current = null;
    if (inflightRef.current || sessionRef.current?.status !== 'ready') return;
    try {
      const stopped = await stopAgentSession(sessionRef.current.id);
      const next = { ...sessionRef.current, ...stopped, status: 'stopped' };
      sessionRef.current = next;
      setSession(next);
      saveConversation(activeRef.current, turnsRef.current, next);
      setStatus('paused', 'stopped');
    } catch {
      scheduleAutoStop();
    }
  }

  function scheduleAutoStop() {
    clearAutoStop();
    if (sessionRef.current?.status !== 'ready') return;
    autoStopTimerRef.current = window.setTimeout(() => { void stopIdleSession(); }, AGENT_AUTO_STOP_MS);
  }

  function clearAutoStop() {
    if (autoStopTimerRef.current !== null) window.clearTimeout(autoStopTimerRef.current);
    autoStopTimerRef.current = null;
  }

  function saveConversation(active, nextTurns, nextSession) {
    if (!active && nextTurns.length === 0 && !nextSession) return;
    const base = active || ensureActiveConversation('Poaster chat');
    const firstUser = nextTurns.find((turn) => turn.role === 'user')?.content;
    const saved = {
      ...base,
      title: compactTitle(firstUser || base.title || 'Poaster chat'),
      turns: nextTurns.slice(-MAX_STORED_TURNS),
      session: nextSession,
      updatedAt: Date.now(),
    };
    activeRef.current = saved;
    setActiveConversation(saved);
    const nextConversations = [saved, ...conversationsRef.current.filter((item) => item.id !== saved.id)].slice(0, 25);
    conversationsRef.current = nextConversations;
    setConversations(nextConversations);
    persistConversations(nextConversations);
    persistActiveId(saved.id);
  }

  function setStatus(text, state = text) {
    setStatusState({ text, state });
  }

  function fillAgentPrompt(prompt) {
    if (!agentMessageRef.current) return;
    agentMessageRef.current.value = prompt;
    agentMessageRef.current.focus();
  }

  return (
    <main className="mx-auto grid min-h-screen min-h-dvh w-full max-w-[1180px] grid-cols-[minmax(0,600px)_minmax(0,1fr)] border-x border-border bg-background text-foreground max-[860px]:grid-cols-1 max-[860px]:border-x-0">
      <section className="min-w-0 border-r border-border max-[860px]:border-r-0 max-[860px]:border-b" aria-label="Post composer">
        <header className="sticky top-0 z-10 border-b border-border bg-background/85 px-4 py-3 backdrop-blur-xl max-[520px]:px-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h1 className="text-xl font-bold tracking-tight">Home</h1>
              <p className="text-sm text-muted-foreground">Drafting as @poaster</p>
            </div>
            <Badge variant="secondary" className="rounded-full max-[420px]:hidden">shadcn b0</Badge>
          </div>
          <Tabs value="for-you" className="mt-3">
            <TabsList variant="line" className="grid h-10 w-full grid-cols-2 p-0">
              <TabsTrigger value="for-you" className="h-10 rounded-none border-0 data-active:text-foreground data-active:after:bg-sky-500">For you</TabsTrigger>
              <TabsTrigger value="following" className="h-10 rounded-none border-0">Following</TabsTrigger>
            </TabsList>
          </Tabs>
        </header>

        <section className="grid gap-4 border-b border-border p-4 max-[520px]:gap-3 max-[520px]:p-3" aria-label="Post composer">
          <DraftTweetCard text={draft} onTextChange={setDraft} remaining={left} canPost={canPost} />
        </section>
      </section>

      <aside className="grid min-h-dvh min-w-0 grid-rows-[auto_minmax(0,1fr)_auto] gap-4 bg-card/40 p-6 max-[860px]:p-5 max-[520px]:gap-3 max-[520px]:p-3" aria-label="AI agent">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold tracking-tight">Assistant</h1>
            <p className="text-sm text-muted-foreground">Rewrite, punch up, or sanity-check the post.</p>
          </div>
          <StatusPill status={status} />
        </header>

        <Card className="min-h-80 overflow-hidden rounded-3xl bg-background max-[520px]:min-h-64 max-[520px]:rounded-2xl">
          <CardContent ref={transcriptRef} className="flex h-full max-h-[calc(100dvh-260px)] min-h-80 flex-col gap-3 overflow-auto p-4 max-[520px]:max-h-[calc(100dvh-230px)] max-[520px]:min-h-64 max-[520px]:p-3">
            {messages.length === 0 ? <Message role="assistant" text="Ask for punchier wording, variants, hooks, or a critique. I can see the draft automatically." /> : null}
            {messages.map((turn, index) => <Message key={`${turn.role}-${index}`} role={turn.role} text={turn.content} />)}
          </CardContent>
        </Card>

        <form onSubmit={sendAgentMessage} className="rounded-3xl border border-border bg-background p-4 max-[520px]:rounded-2xl max-[520px]:p-3">
          <div className="mb-3 flex flex-wrap gap-2" aria-label="Suggested prompts">
            {suggestedPrompts.map((prompt) => (
              <Button key={prompt} type="button" variant="secondary" size="sm" className="h-auto rounded-full px-3 py-1.5 text-left text-xs whitespace-normal" onClick={() => fillAgentPrompt(prompt)}>{prompt}</Button>
            ))}
          </div>
          <p className="mb-2 text-xs text-muted-foreground">Draft text is included automatically.</p>
          <Textarea ref={agentMessageRef} name="agentMessage" rows={3} placeholder="Help me improve this post…" className="resize-y border-0 bg-transparent p-0 text-foreground shadow-none focus-visible:ring-0 dark:bg-transparent" />
          <div className="mt-3 flex justify-end max-[420px]:justify-stretch">
            <Button type="submit" disabled={inflight} className="rounded-full bg-sky-500 text-white hover:bg-sky-600 max-[420px]:w-full"><Send /> send</Button>
          </div>
        </form>
      </aside>
    </main>
  );
}

function DraftTweetCard({ text, onTextChange, remaining, canPost }) {
  return (
    <Card className="w-full max-w-[560px] rounded-2xl border-[#2f3336] bg-black text-[#e7e9ea] shadow-none">
      <CardHeader className="flex flex-row items-start gap-3 px-4 pt-4 pb-0 max-[520px]:px-3 max-[520px]:pt-3">
        <Avatar className="size-10 bg-gradient-to-br from-sky-500 to-violet-500 text-white max-[520px]:size-9">
          <AvatarFallback className="bg-transparent font-black text-white">P</AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1">
            <strong className="truncate">Poaster</strong>
            <BadgeCheck className="size-4 fill-[#1d9bf0] text-white" />
          </div>
          <div className="truncate text-sm text-[#71767b]">@poaster</div>
        </div>
        <Button variant="ghost" size="icon-sm" className="rounded-full text-[#71767b]"><MoreHorizontal /></Button>
      </CardHeader>
      <CardContent className="px-4 pb-4 pt-3 max-[520px]:px-3 max-[520px]:pb-3">
        <Textarea
          value={text}
          onChange={(event) => onTextChange(event.target.value)}
          maxLength={560}
          placeholder="What is happening?!"
          aria-label="Post draft"
          className="min-h-32 resize-y border-0 bg-transparent p-0 text-xl leading-7 text-[#e7e9ea] shadow-none placeholder:text-[#71767b] focus-visible:ring-0 dark:bg-transparent max-[520px]:min-h-28 max-[520px]:text-lg"
        />
        <div className="mt-4 text-sm text-[#71767b] max-[520px]:text-xs">12:00 PM · Jul 8, 2026 · <span className="text-[#e7e9ea]">0</span> Views</div>
        <div className="mt-4 grid grid-cols-5 border-y border-[#2f3336] py-2 text-[#71767b]">
          {[MessageCircle, Repeat2, Heart, BarChart3, Upload].map((Icon, index) => <span key={index} className="flex items-center justify-center"><Icon className="size-5" /></span>)}
        </div>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <span className={cn('text-sm text-[#71767b]', remaining < 0 && 'font-bold text-destructive')}>{remaining}</span>
          <a
            className={cn(buttonVariants({ size: 'lg' }), 'rounded-full bg-sky-500 text-white hover:bg-sky-600 max-[420px]:w-full', !canPost && 'pointer-events-none opacity-50')}
            href={canPost ? buildTweetIntentUrl(text) : undefined}
            aria-disabled={!canPost}
            target="_blank"
            rel="noopener noreferrer"
          >
            Post on X
          </a>
        </div>
      </CardContent>
    </Card>
  );
}

function Message({ role, text }) {
  return (
    <div className={cn(
      'max-w-[88%] whitespace-pre-wrap break-words rounded-2xl px-4 py-3 leading-relaxed max-[520px]:max-w-[94%] max-[520px]:px-3',
      role === 'user' ? 'self-end bg-sky-500 text-white' : 'self-start border border-border bg-muted text-foreground',
    )}>
      {text || '…'}
    </div>
  );
}

function StatusPill({ status }) {
  return <Badge variant="outline" className={cn('max-w-full rounded-full px-3 py-1', status.state === 'ready' && 'border-emerald-500/50 text-emerald-300', status.state === 'running' && 'border-yellow-500/50 text-yellow-300', status.state === 'starting' && 'border-yellow-500/50 text-yellow-300', status.state === 'error' && 'border-red-500/50 text-red-300')}>● {status.text}</Badge>;
}

function statusFromSession(session, activeConversation) {
  if (!session) return { text: activeConversation ? 'saved' : 'idle', state: 'idle' };
  if (session.status === 'ready') return { text: 'ready', state: 'ready' };
  if (session.status === 'stopped') return { text: 'paused', state: 'stopped' };
  if (session.status === 'error') return { text: 'error', state: 'error' };
  return { text: cleanStatus(session.status || 'idle'), state: session.status || 'idle' };
}

function loadConversations() {
  try {
    const value = JSON.parse(localStorage.getItem(AGENT_STORE_KEY) || '[]');
    if (!Array.isArray(value)) return [];
    return value.map(normalizeConversation).filter(Boolean);
  } catch {
    return [];
  }
}

function normalizeConversation(item) {
  if (!item || typeof item !== 'object' || typeof item.id !== 'string') return null;
  const turns = Array.isArray(item.turns)
    ? item.turns.filter((turn) => turn && (turn.role === 'user' || turn.role === 'assistant') && typeof turn.content === 'string')
    : [];
  return {
    id: item.id,
    title: typeof item.title === 'string' ? item.title : 'Poaster chat',
    turns,
    session: item.session && typeof item.session.id === 'string' ? item.session : null,
    createdAt: Number(item.createdAt) || Date.now(),
    updatedAt: Number(item.updatedAt) || Date.now(),
  };
}

function loadActiveConversation(conversations) {
  try {
    const id = localStorage.getItem(AGENT_ACTIVE_KEY);
    return conversations.find((item) => item.id === id) || conversations[0] || null;
  } catch {
    return conversations[0] || null;
  }
}

function persistConversations(conversations) {
  try { localStorage.setItem(AGENT_STORE_KEY, JSON.stringify(conversations)); } catch { /* noop */ }
}

function persistActiveId(id) {
  try { localStorage.setItem(AGENT_ACTIVE_KEY, id); } catch { /* noop */ }
}

function cleanStatus(message) {
  return String(message)
    .replace(/cloudflare\s+sandbox/ig, 'agent')
    .replace(/sandbox/ig, 'agent')
    .replace(/\bpi\b/ig, 'assistant')
    .slice(0, 80);
}

function compactTitle(value) {
  return String(value || 'Poaster chat').replace(/\s+/g, ' ').trim().slice(0, 56) || 'Poaster chat';
}

function localConversationId() {
  return `local-${crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36)}`;
}
