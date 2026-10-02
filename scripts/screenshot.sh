#!/usr/bin/env bash
# Captures a screenshot of the dashboard. Usage:
#   scripts/screenshot.sh [country] [width] [height]
set -euo pipefail

cd "$(dirname "$0")/.."

country="${1:-IT}"
width="${2:-1440}"
height="${3:-900}"
port=8123

# Firefox only honours the --screenshot=<path> form; with a space it exits 0
# without writing anything.
mkdir -p screenshots
profile="$(mktemp -d)"

python3 -m http.server "$port" --bind 127.0.0.1 >/dev/null 2>&1 &
server=$!
trap 'kill $server 2>/dev/null; rm -rf "$profile"' EXIT
sleep 1

curl -sf "http://127.0.0.1:${port}/" >/dev/null ||
  { echo "couldn't start a server on port $port" >&2; exit 1; }

shot="screenshots/day3-${country}-${width}x${height}.png"
firefox --headless \
  --profile "$profile" \
  --window-size="${width},${height}" \
  --screenshot="$PWD/$shot" \
  "http://127.0.0.1:${port}/?country=${country}" >/dev/null 2>&1

test -s "$shot" || { echo "screenshot failed" >&2; exit 1; }
echo "wrote $shot"
