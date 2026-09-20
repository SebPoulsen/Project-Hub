#!/bin/bash
# Double-clickable launcher for Project Hub.
# Right-click > Open the first time if macOS Gatekeeper complains.
#
# Idempotent: safe to double-click any number of times. It will never start a
# second server or open a duplicate browser tab.
#   1. If a server is already listening on :4321, it is left alone.
#   2. Otherwise the app is built and started in production mode.
#   3. An existing localhost:4321 Chrome tab is focused; only if none exists is
#      a new tab opened.

cd "$(dirname "$0")" || exit 1

PORT=4321
URL="http://localhost:$PORT"

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

# --- helpers ---------------------------------------------------------------

# True when something is already listening on $PORT.
server_running() {
  lsof -nP -iTCP:"$PORT" -sTCP:LISTEN >/dev/null 2>&1
}

# Focus an existing localhost:4321 Chrome tab, or open a new one. Falls back to
# the default browser (`open`) if Chrome isn't installed. A plain `open URL`
# always spawns a new tab, so we drive Chrome via AppleScript to look for an
# already-open tab first and just re-focus it — that's what keeps repeat clicks
# from piling up duplicate tabs.
open_or_focus_browser() {
  if osascript -e 'id of app "Google Chrome"' >/dev/null 2>&1; then
    osascript - "$URL" <<'OSA'
on run argv
	set targetURL to item 1 of argv
	tell application "Google Chrome"
		set found to false
		repeat with w in windows
			set i to 0
			repeat with t in tabs of w
				set i to i + 1
				if (URL of t) starts with targetURL then
					set active tab index of w to i
					set index of w to 1
					set found to true
					exit repeat
				end if
			end repeat
			if found then exit repeat
		end repeat
		if not found then
			if (count of windows) is 0 then
				make new window
				set URL of active tab of front window to targetURL
			else
				tell front window to make new tab with properties {URL:targetURL}
			end if
		end if
		activate
	end tell
end run
OSA
  else
    open "$URL"
  fi
}

# --- 1. already running? ---------------------------------------------------

if server_running; then
  echo "Project Hub is already running at $URL — focusing the browser."
  open_or_focus_browser
  exit 0
fi

# --- 2. not running: build + start in production mode -----------------------

if [ ! -d node_modules ]; then
  echo "First run — installing dependencies (one time)…"
  npm install || { read -r -p "Install failed. Press Enter to close." _; exit 1; }
fi

# Open (or focus) the browser once the server is actually accepting connections.
# The production build can take a while, so we poll the port rather than sleep a
# fixed amount. Runs in the background while `npm start` holds the foreground.
(
  for _ in $(seq 1 300); do
    server_running && { open_or_focus_browser; exit 0; }
    sleep 1
  done
  # Timed out (build likely failed) — leave the terminal showing the error.
) &

echo "Building Project Hub (production)…"
echo "When it's ready it will open at $URL  (Ctrl+C to stop the server)"
npm run build && npm start
