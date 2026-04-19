#!/usr/bin/env bash
# Install the Manus Daily CSV Routine as a macOS LaunchAgent (runs daily at 08:00 local).
#
# Usage:
#   bash scripts/daily-csv-routine/launchd/install.sh
#
# What it does:
#   1. Copies com.vo360.csv-routine.plist to ~/Library/LaunchAgents/
#   2. Rewrites the node path inside the copy to match `which node` on this machine
#   3. Loads the agent via `launchctl bootstrap` (or falls back to `launchctl load`)
#
# To remove:
#   launchctl bootout gui/$(id -u) ~/Library/LaunchAgents/com.vo360.csv-routine.plist
#   rm ~/Library/LaunchAgents/com.vo360.csv-routine.plist
#
# To trigger a run right now (without waiting for 08:00):
#   launchctl kickstart gui/$(id -u)/com.vo360.csv-routine

set -euo pipefail

SRC_DIR="$(cd "$(dirname "$0")" && pwd)"
PLIST_NAME="com.vo360.csv-routine.plist"
SRC_PLIST="$SRC_DIR/$PLIST_NAME"
DEST_DIR="$HOME/Library/LaunchAgents"
DEST_PLIST="$DEST_DIR/$PLIST_NAME"
NODE_BIN="$(command -v node)"

if [ -z "$NODE_BIN" ]; then
  echo "ERROR: node not found on PATH. Install Node.js and try again."
  exit 1
fi

mkdir -p "$DEST_DIR"
mkdir -p "$HOME/Desktop/CSV Ready Zips/_logs"

# Copy and patch the node path
sed "s|/opt/homebrew/bin/node|$NODE_BIN|g" "$SRC_PLIST" > "$DEST_PLIST"

echo "Installed: $DEST_PLIST"
echo "Node path: $NODE_BIN"

# Unload if already loaded (idempotent)
launchctl bootout "gui/$(id -u)" "$DEST_PLIST" 2>/dev/null || true

# Load
if launchctl bootstrap "gui/$(id -u)" "$DEST_PLIST" 2>/dev/null; then
  echo "Loaded via launchctl bootstrap (modern syntax)."
else
  launchctl load "$DEST_PLIST"
  echo "Loaded via launchctl load (legacy syntax)."
fi

echo ""
echo "Active. Daily runs at 08:00 local."
echo "Kick off a test run now with:"
echo "  launchctl kickstart gui/\$(id -u)/com.vo360.csv-routine"
