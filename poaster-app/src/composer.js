export const MAX_TWEET_CHARS = 280;

const STARTER_AGENT_PROMPTS = [
  'Help me find a sharp angle for a post.',
  'Draft 5 punchy post ideas from a rough thought.',
  'Give me hooks for something people will actually read.',
];

const DRAFT_AGENT_PROMPTS = [
  'Critique the draft. Be blunt, then give a cleaner version.',
  'Make the draft punchier without changing the point.',
  'Give me 5 alternate hooks for the draft.',
];

export function countTweetChars(text) {
  // ponytail: X has weighted URLs/CJK rules; swap in official twitter-text if exact parity matters.
  return [...String(text || '')].length;
}

export function remainingTweetChars(text) {
  return MAX_TWEET_CHARS - countTweetChars(text);
}

export function isTweetLengthOk(text) {
  const count = countTweetChars(text);
  return count > 0 && count <= MAX_TWEET_CHARS;
}

export function buildTweetIntentUrl(text) {
  const url = new URL('https://twitter.com/intent/tweet');
  url.searchParams.set('text', String(text || '').trim());
  return url.toString();
}

export function getSuggestedAgentPrompts(text) {
  return String(text || '').trim() ? DRAFT_AGENT_PROMPTS : STARTER_AGENT_PROMPTS;
}

export function tweetIdFromUrl(value) {
  try {
    const url = new URL(String(value || '').trim());
    if (!/(^|\.)x\.com$|(^|\.)twitter\.com$/.test(url.hostname)) return null;
    const parts = url.pathname.split('/').filter(Boolean);
    const marker = parts.findIndex((part) => part === 'status' || part === 'statuses');
    const id = marker >= 0 ? parts[marker + 1] : '';
    return /^\d{5,}$/.test(id || '') ? id : null;
  } catch {
    return null;
  }
}
