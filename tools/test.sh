#!/usr/bin/env bash
# Run the headless scene smoke test. Fetches Godot first if needed.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
"$ROOT/tools/get_godot.sh" >/dev/null
# First pass builds the .godot/ import cache (needed for global class names).
"$ROOT/.godot-bin/godot" --headless --path "$ROOT/mobile-games" --import >/dev/null 2>&1 || true
exec "$ROOT/.godot-bin/godot" --headless --path "$ROOT/mobile-games" --script tests/smoke.gd
