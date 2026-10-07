#!/usr/bin/env bash
# Captures a screenshot of the dashboard. Usage:
#   scripts/screenshot.sh [country] [width] [height]
#
# Two Firefox quirks are worked around here:
#
#  * Only the --screenshot=<path> form works. With a space it exits 0 and
#    writes nothing.
#  * The capture is taken at the load event, which can land before an async
#    fetch() has resolved. ?sync=1 makes the page fetch synchronously and
#    Chart.js runs with animation off, so both charts finish first — but the
#    load event can still win the race, so every capture is checked and
#    retried rather than trusted.
set -euo pipefail

cd "$(dirname "$0")/.."

country="${1:-IT}"
width="${2:-1440}"
height="${3:-1400}"
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

# One pass over the image, checking five things the placeholder could pass by
# accident. Thresholds are exact-match pixel counts measured against real
# captures rather than guessed:
#
#   nodata    summary line      placeholder scores 0, rendered scores ~500
#   nocolour  three series      ~150 of each comes from legend swatches alone,
#                               so 400 means a plot, not just a key
#   nobar     a solid block     a 2px line tops out at a 14px vertical run,
#                               a bar runs tens of pixels
#   noline    diagonal strokes  line-only captures score ~250 columns with a
#                               2-20px run; bare legend and bars score near 0
#   clipped   page background   the last rows must be empty page, not content
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

SERIES = frozenset(((31, 111, 235), (176, 42, 31), (15, 118, 110)))
MUTED = (91, 103, 112)
BACKGROUND = (246, 248, 250)

tallies = {colour: 0 for colour in SERIES}
tallies[MUTED] = 0
max_run = 0
thin_columns = 0

for x in range(width):
    run = 0
    column_max = 0
    for y in range(height):
        pixel = pixels[x, y]
        if pixel in tallies:
            tallies[pixel] += 1
        if pixel in SERIES:
            run += 1
        else:
            column_max = max(column_max, run)
            run = 0
    column_max = max(column_max, run)
    max_run = max(max_run, column_max)
    if 2 <= column_max <= 20:
        thin_columns += 1

if tallies[MUTED] <= 200:
    print("nodata")
elif any(tallies[colour] <= 400 for colour in SERIES):
    print("nocolour")
elif max_run < 40:
    print("nobar")
elif thin_columns < 50:
    print("noline")
else:
    tail = sum(
        1
        for y in range(height - 5, height)
        for x in range(width)
        if pixels[x, y] == BACKGROUND
    )
    print("ok" if tail >= width * 5 * 0.95 else "clipped")
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
    ok)       echo "wrote $shot (attempt $attempt)"; exit 0 ;;
    nopil)    echo "wrote $shot (unverified: needs Pillow)"; exit 0 ;;
    nodata)   echo "attempt $attempt/$attempts: summary had not rendered" >&2 ;;
    nocolour) echo "attempt $attempt/$attempts: a series had not drawn" >&2 ;;
    nobar)    echo "attempt $attempt/$attempts: bar chart had not drawn" >&2 ;;
    noline)   echo "attempt $attempt/$attempts: line chart had not drawn" >&2 ;;
    clipped)  echo "attempt $attempt/$attempts: page was cut off, needs a taller window" >&2 ;;
    *)        echo "attempt $attempt/$attempts: could not verify" >&2 ;;
  esac
done

echo "gave up: $shot still missing content after $attempts attempts" >&2
exit 1
