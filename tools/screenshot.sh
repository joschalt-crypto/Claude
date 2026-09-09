#!/usr/bin/env bash
# Render every scene to shots/*.png using a virtual display, so you can review
# layout from a terminal-only machine. Needs xvfb-run.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="${1:-$ROOT/shots}"

"$ROOT/tools/get_godot.sh" >/dev/null
"$ROOT/.godot-bin/godot" --headless --path "$ROOT/mobile-games" --import >/dev/null 2>&1 || true

mkdir -p "$OUT"
# opengl3 + llvmpipe is the combination that works on a headless box.
xvfb-run -a "$ROOT/.godot-bin/godot" \
  --path "$ROOT/mobile-games" \
  --resolution 720x1280 \
  --rendering-driver opengl3 \
  --script tests/screenshot.gd \
  -- "$OUT" 2>&1 | grep -E "^saved" || {
    echo "screenshot run produced no output; rerun without the grep to see errors" >&2
    exit 1
  }
