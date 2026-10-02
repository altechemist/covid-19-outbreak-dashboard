#!/usr/bin/env bash
# Captures a screenshot of the dashboard. Usage:
#   scripts/screenshot.sh [country] [width] [height]
#
# Two Firefox quirks are worked around here:
#
#  * Only the --screenshot=<path> form works. With a space it exits 0 and
#    writes nothing.
#  * The capture is taken at the load event, which can land before an async
#    fetch() resolves. ?sync=1 makes the page fetch synchronously so the render
#    finishes first, but the load event can still win the race, so every
#    capture is checked and retried rather than trusted.
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

shot="screenshots/day3-${country}-${width}x${height}.png"
url="http://127.0.0.1:${port}/?country=${country}&sync=1"

# The summary line under the heading is --muted; the loading placeholder is
# not. Counting those pixels says whether the page actually rendered.
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
muted = sum(1 for y in range(image.size[1]) for x in range(image.size[0])
            if pixels[x, y] == (91, 103, 112))
print("ok" if muted > 200 else "placeholder")
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
    ok)    echo "wrote $shot (attempt $attempt)"; exit 0 ;;
    nopil) echo "wrote $shot (unverified: needs Pillow)"; exit 0 ;;
  esac

  echo "attempt $attempt/$attempts: page had not rendered, retrying" >&2
done

echo "gave up: $shot still shows the loading placeholder" >&2
exit 1
