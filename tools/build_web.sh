#!/usr/bin/env bash
# Export the project as a web build into docs/, which GitHub Pages serves.
# Downloads the ~1 GB export templates on first run.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
VERSION="${GODOT_VERSION:-4.3-stable}"
TEMPLATE_DIR="$HOME/.local/share/godot/export_templates/${VERSION/-/.}"

"$ROOT/tools/get_godot.sh" >/dev/null

if [ ! -f "$TEMPLATE_DIR/web_nothreads_release.zip" ]; then
  echo "Fetching export templates (~1 GB, first run only)..."
  tmp="$(mktemp -d)"
  curl -sSL -o "$tmp/templates.tpz" \
    "https://github.com/godotengine/godot/releases/download/${VERSION}/Godot_v${VERSION}_export_templates.tpz"
  unzip -q -o "$tmp/templates.tpz" -d "$tmp"
  mkdir -p "$(dirname "$TEMPLATE_DIR")"
  rm -rf "$TEMPLATE_DIR"
  mv "$tmp/templates" "$TEMPLATE_DIR"
  rm -rf "$tmp"
fi

mkdir -p "$ROOT/docs"
"$ROOT/.godot-bin/godot" --headless --path "$ROOT/mobile-games" --import >/dev/null 2>&1 || true
"$ROOT/.godot-bin/godot" --headless --path "$ROOT/mobile-games" \
  --export-release "Web" "$ROOT/docs/index.html"

# Stops GitHub Pages from running Jekyll, which would drop the build files.
touch "$ROOT/docs/.nojekyll"

echo
echo "Built into docs/:"
ls -la "$ROOT/docs"
