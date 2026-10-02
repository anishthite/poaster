You are running a local Twitter/X timeline scrape.

Use pi-chrome against the user's already-signed-in Chrome. Do not use the X API. Do not post, like, follow, bookmark, or reply. Do not invent data.

Required inputs are listed at the bottom of this prompt:
- workflow
- date
- source
- raw output path
- digest output path
- context output path
- guidance file path
- reply guidance file path
- suggestions output path
- review data dir path
- optional target tweet URL
- state file path

Supported workflow:
- `timeline`: scrape the home timeline, then open each captured tweet and collect the first 3 visible replies.

Scrape rules for `timeline`:
1. Check Chrome/pi-chrome access. If Chrome is not authorized, stop and say exactly what command the user must run. Do not write fake output.
2. Open or activate `https://x.com/home`.
3. Collect up to 20 home timeline tweets or stop after 10 minutes, whichever comes first.
4. For each collected tweet with a stable status URL, open the tweet page and collect the first 3 visible replies after the original tweet.
5. If a tweet has fewer than 3 visible replies, store the replies you can see and add a caveat; do not guess missing replies.
6. Keep each `chrome_evaluate` snippet small and synchronous: inspect visible `article` nodes only, slice to 10-20 items, and avoid full-page text dumps or async waits.
7. Do not use `chrome_scroll`; use `window.scrollBy(...)` or `document.scrollingElement.scrollTo(...)` inside `chrome_evaluate`.
8. If `chrome_evaluate` times out, reload/activate X once and retry with a smaller visible-article snippet.
9. If scrolling stops after at least one valid item, write outputs from collected items instead of failing the run.

Store this for each timeline tweet:
- `id`: status id if visible, otherwise the canonical tweet URL.
- `url`: canonical `https://x.com/<handle>/status/<id>` URL.
- `author`: visible display name.
- `handle`: visible `@handle`.
- `text`: tweet body text, excluding unrelated page chrome.
- `createdAt`: `time[datetime]` when available, otherwise the visible timestamp text.
- `metrics`: visible counts only: `replies`, `reposts`, `likes`, `views`.
- `media`: visible media metadata when cheap: `{ kind, alt, url }` for image/video/gif.
- `capturedAt`: ISO timestamp for this scrape.
- `replies`: first 3 visible reply objects for this tweet.

Store this for each reply:
- `id`: reply status id if visible, otherwise the reply URL.
- `url`: canonical reply URL.
- `parentUrl`: timeline tweet URL.
- `replyIndex`: 1, 2, or 3 in visible order.
- `author`: visible display name.
- `handle`: visible `@handle`.
- `text`: reply body text.
- `createdAt`: `time[datetime]` when available, otherwise the visible timestamp text.
- `metrics`: visible counts only: `replies`, `reposts`, `likes`, `views`.
- `media`: visible media metadata when cheap: `{ kind, alt, url }`.
- `isAuthorReply`: true when the reply handle matches the parent tweet handle.
- `capturedAt`: ISO timestamp for this scrape.

Write raw JSON to the raw output path:

```json
{
  "date": "YYYY-MM-DD",
  "workflow": "timeline",
  "source": "home-timeline-with-replies",
  "items": [
    {
      "id": "string-or-url",
      "url": "https://x.com/.../status/...",
      "author": "visible display name",
      "handle": "@handle",
      "text": "tweet text",
      "createdAt": "visible timestamp or ISO datetime",
      "metrics": { "replies": 0, "reposts": 0, "likes": 0, "views": 0 },
      "media": [{ "kind": "image", "alt": "", "url": "" }],
      "capturedAt": "ISO timestamp",
      "replies": [
        {
          "id": "string-or-url",
          "url": "https://x.com/.../status/...",
          "parentUrl": "https://x.com/.../status/...",
          "replyIndex": 1,
          "author": "visible display name",
          "handle": "@handle",
          "text": "reply text",
          "createdAt": "visible timestamp or ISO datetime",
          "metrics": { "replies": 0, "reposts": 0, "likes": 0, "views": 0 },
          "media": [],
          "isAuthorReply": false,
          "capturedAt": "ISO timestamp"
        }
      ]
    }
  ],
  "caveats": ["data limitation"]
}
```

Distill raw items into digest JSON at the digest output path:

```json
{
  "date": "YYYY-MM-DD",
  "workflow": "timeline",
  "source": "home-timeline-with-replies",
  "sourceCount": 0,
  "replyCount": 0,
  "learnings": [
    { "title": "specific lesson", "detail": "why it matters", "evidenceUrls": ["https://x.com/..."] }
  ],
  "topics": ["topic"],
  "followUps": ["actionable idea"],
  "caveats": ["data limitation"]
}
```

Distillation rules:
- Prefer reusable lessons from hooks, framing, offers, objections, reply openings, and visible audience signals.
- Use replies to explain why the parent tweet did or did not create good conversation.
- Every learning should cite at least one evidence URL when available.
- Keep 3-7 learnings, 3-8 topics, and 3-7 follow-ups.
- If there are too few posts, weak metrics, or missing replies, say that in `caveats` instead of padding.

Final steps:
- Update the state file with latest successful date, workflow, seen tweet URLs/ids, and written output paths.
- Final response: one short summary with timeline tweet count, reply count, and top takeaway. No Markdown table.
