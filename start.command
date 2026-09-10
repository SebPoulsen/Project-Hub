#!/bin/bash
# Double-clickable launcher for Project Hub.
# Right-click > Open the first time if macOS Gatekeeper complains.

cd "$(dirname "$0")" || exit 1

# Make sure common Node install locations are on PATH (Finder launches don't
# load your shell profile).
for p in /opt/homebrew/bin /usr/local/bin "$HOME/.volta/bin"; do
  [ -x "$p/node" ] && export PATH="$p:$PATH"
done

if ! command -v node >/dev/null 2>&1; then
  echo "──────────────────────────────────────────────"
  echo " Node.js is not installed."
  echo " Install the LTS from https://nodejs.org, then"
  echo " double-click this file again."
  echo "──────────────────────────────────────────────"
  read -r -p "Press Enter to close." _
  exit 1
fi

if [ ! -d node_modules ]; then
  echo "First run — installing dependencies (one time)…"
  npm install || { read -r -p "Install failed. Press Enter to close." _; exit 1; }
fi

# Open the browser a moment after the server starts.
( sleep 3 && open "http://localhost:4321" ) &

echo "Starting Project Hub at http://localhost:4321  (Ctrl+C to stop)"
npm run dev
