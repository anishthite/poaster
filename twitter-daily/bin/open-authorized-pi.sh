#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cat <<'EOF'
Opening a dedicated Pi session.

Inside it, run:
  /chrome doctor
  /chrome authorize indefinite
  /chrome background on

Keep that Pi session alive. Authorization is per Pi process, not global.
EOF

exec pi --name twitter-daily-chrome @"$ROOT/CHROME_AUTH.md" "Help me keep twitter-daily authorized with pi-chrome. Wait for me to run /chrome authorize indefinite; do not scrape until I ask."
