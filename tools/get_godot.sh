#!/usr/bin/env bash
# Download a headless-capable Godot binary into .godot-bin/ (git-ignored).
# Usage:  ./tools/get_godot.sh  &&  .godot-bin/godot --version
set -euo pipefail

VERSION="${GODOT_VERSION:-4.3-stable}"
DEST="$(cd "$(dirname "$0")/.." && pwd)/.godot-bin"
BIN="$DEST/godot"

if [ -x "$BIN" ]; then
  echo "Godot already present: $("$BIN" --headless --version)"
  exit 0
fi

case "$(uname -m)" in
  x86_64)  ARCH="x86_64" ;;
  aarch64|arm64) ARCH="arm64" ;;
  *) echo "Unsupported architecture: $(uname -m)" >&2; exit 1 ;;
esac

FILE="Godot_v${VERSION}_linux.${ARCH}"
URL="https://github.com/godotengine/godot/releases/download/${VERSION}/${FILE}.zip"

mkdir -p "$DEST"
echo "Downloading $URL"
curl -sSL -o "$DEST/godot.zip" "$URL"
unzip -o -q "$DEST/godot.zip" -d "$DEST"
mv "$DEST/$FILE" "$BIN"
chmod +x "$BIN"
rm -f "$DEST/godot.zip"

echo "Installed: $("$BIN" --headless --version)"
