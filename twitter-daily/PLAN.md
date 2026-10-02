# Twitter Daily plan

Goal: run once a day on this Mac, use `pi-chrome` against my signed-in X/Twitter session, distill useful patterns, and show the latest learning digest in a tiny local web app.

## Lazy default

Use local files, OS cron/launchd, and the existing Pi + `pi-chrome` setup. No cloud worker, no API keys, no database until plain files hurt.

## Shape

- `twitter-daily/` is a local app folder.
- `cron` or `launchd` runs `bin/run-daily.sh` once a day.
- `run-daily.sh` invokes `pi -p` with a fixed prompt in `prompts/daily-twitter.md`.
- Pi uses `pi-chrome` to read X in your already-signed-in Chrome profile.
- Output lands in local JSON files and a rendered static page under `public/`.
- Serve the app locally with `npm run serve`; the local server adds auth/run buttons.

See `twitter-daily/architecture.svg`.

## Flow

1. Local scheduler fires daily.
2. `bin/run-daily.sh` creates today's run folder and calls Pi with the scraping/distillation prompt.
3. Pi activates or opens X via `pi-chrome`, scrolls bounded surfaces, and extracts visible tweet data.
4. Pi writes `data/raw/YYYY-MM-DD.json` with source items and evidence URLs.
5. Pi distills the raw data into `data/digests/YYYY-MM-DD.json`.
6. `scripts/render.mjs` rebuilds `public/index.html` and digest JSON for the web app.
7. `scripts/server.mjs` serves `http://127.0.0.1:8787` with buttons to open Chrome auth and start a run.
8. You open `http://127.0.0.1:8787` to review the latest digest.

## Local data model

```text
data/
  raw/YYYY-MM-DD.json        # scraped tweets/posts + evidence URLs
  digests/YYYY-MM-DD.json    # distilled learnings, topics, ideas
  state.json                 # last successful run, seen tweet ids/urls
public/
  index.html                 # static app shell
  digests/YYYY-MM-DD.json    # browser-readable copy
  digests/index.json         # newest-first digest list
```

Digest JSON:

```json
{
  "date": "2026-07-09",
  "sourceCount": 42,
  "learnings": [{ "title": "...", "detail": "...", "evidenceUrls": ["..."] }],
  "topics": ["..."],
  "followUps": ["..."]
}
```

## Pi/chrome requirements

- `pi-chrome` installed and healthy: `/chrome doctor`.
- Chrome open with your X account signed in.
- The run's Pi session authorized for Chrome control: `/chrome authorize indefinite`.
- Click **Open Chrome auth** in the web app, or use `npm run auth`, to open a dedicated long-lived Pi session.
- Cron-created `pi -p` sessions do not inherit authorization; keep the authorized Pi process alive or run manually after authorizing.

## Milestones

1. Add `.gitignore`, `bin/run-daily.sh`, `prompts/daily-twitter.md`, `scripts/render.mjs`, and `public/index.html`.
2. Make the prompt scrape one bounded source first: profile + replies, or bookmarks if you prefer.
3. Save raw JSON and a deterministic digest JSON without any extra services.
4. Render the static local web app from digest JSON.
5. Add one assert-based check for renderer/date ordering.
6. Add a sample cron/launchd entry after the manual run works.

## Open questions

- Which X surface is the source: your posts/replies, bookmarks, likes, home timeline, or notifications?
- Should the daily run be fully unattended, or is a manual `/chrome authorize` acceptable before it runs?
- What local time should the scheduler run?

## Explicit skips

- No Cloudflare Worker/D1.
- No X API for v1.
- No React dashboard; one static HTML page first.
- No database until file search/history is annoying.
- No multi-user auth; this is local-only.
