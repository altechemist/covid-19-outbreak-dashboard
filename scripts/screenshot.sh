#!/usr/bin/env bash
# Captures a screenshot of the dashboard. Usage:
#   scripts/screenshot.sh [country] [width] [height]
#
# Two Firefox quirks are worked around here:
#
#  * Only the --screenshot=<path> form works. With a space it exits 0 and
#    writes nothing.
#  * The capture is taken at the load event, which can land before an async
#    fetch() resolves. ?sync=1 makes the page fetch synchronously and Chart.js
#    runs with animation off, so both the text and the chart finish first — but
#    the load event can still win the race, so every capture is checked and
#    retried rather than trusted.
set -euo pipefail

cd "$(dirname "$0")/.."

country="${1:-IT}"
width="${2:-1440}"
height="${3:-900}"
port=8123
attempts=5

# Reused between runs so the browser starts warm; a cold launch is the most
# likely to lose the race above.
profile=".firefox-profile"
mkdir -p screenshots "$profile"

python3 -m http.server "$port" --bind 127.0.0.1 >/dev/null 2>&1 &
server=$!
trap 'kill $server 2>/dev/null || true' EXIT
sleep 1

shot="screenshots/dashboard-${country}-${width}x${height}.png"
url="http://127.0.0.1:${port}/?country=${country}&sync=1"

# Two things must both be on screen: the muted summary line under the heading
# (absent while the page is still loading) and one colour per chart series
# (absent when the chart has not drawn). Counts are exact-match pixels; the
# lowest seen in practice is ~630 for a series, so 200 leaves room while still
# failing outright at zero.
check() {
  python3 - "$1" <<'PY' 2>/dev/null || true
import sys
try:
    from PIL import Image
except ImportError:
    print("nopil")
    raise SystemExit

image = Image.open(sys.argv[1]).convert("RGB")
pixels = image.load()
width, height = image.size

def count(colour):
    return sum(1 for y in range(height) for x in range(width)
               if pixels[x, y] == colour)

if count((91, 103, 112)) <= 200:          # --muted summary line
    print("nodata")
elif any(count(c) <= 200 for c in (
    (31, 111, 235),   # confirmed
    (176, 42, 31),    # deaths
    (15, 118, 110),   # recovered
)):
    print("nochart")
else:
    print("ok")
PY
}

for attempt in $(seq "$attempts"); do
  # Cleared first so a failed attempt can't leave yesterday's capture behind.
  rm -f "$shot"

  firefox --headless \
    --profile "$profile" \
    --window-size="${width},${height}" \
    --screenshot="$PWD/$shot" \
    "$url" >/dev/null 2>&1 || true

  if [ ! -s "$shot" ]; then
    echo "attempt $attempt/$attempts: no image written" >&2
    continue
  fi

  case "$(check "$shot")" in
    ok)      echo "wrote $shot (attempt $attempt)"; exit 0 ;;
    nodata)  echo "attempt $attempt/$attempts: summary had not rendered" >&2 ;;
    nochart) echo "attempt $attempt/$attempts: chart had not drawn" >&2 ;;
    nopil)   echo "wrote $shot (unverified: needs Pillow)"; exit 0 ;;
    *)       echo "attempt $attempt/$attempts: could not verify" >&2 ;;
  esac
done

echo "gave up: $shot still missing content after $attempts attempts" >&2
exit 1
