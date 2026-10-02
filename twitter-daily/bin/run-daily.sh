#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DAY="${1:-$(date +%F)}"
SOURCE="${TWITTER_DAILY_SOURCE:-home-timeline-with-replies}"
DIGEST="$ROOT/data/digests/$DAY.json"

mkdir -p "$ROOT/data/raw" "$ROOT/data/digests" "$ROOT/data/context" "$ROOT/public/digests" "$ROOT/public/context" "$ROOT/.runs"

node "$ROOT/scripts/run-pi.mjs" "$ROOT" "$DAY" "$SOURCE"

test -s "$DIGEST"
node "$ROOT/scripts/render.mjs" "$ROOT"
echo "Rendered $ROOT/public/index.html"
