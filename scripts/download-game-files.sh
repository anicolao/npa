#!/bin/bash
#
# Neptune's Pride Game Files Download Script
# Downloads the necessary game files from the official servers for testing
#
# Usage: ./scripts/download-game-files.sh [output-dir]
#
# Default output directory is ./test-game-files

set -e

OUTPUT_DIR="${1:-test-game-files}"
OLDPWD=$PWD

echo "Downloading Neptune's Pride game files to $OUTPUT_DIR..."

# Create output directory if it doesn't exist
mkdir -p "$OUTPUT_DIR"

# List of game files to download
GAME_FILES=(
	"np/game.js"
	"np/inbox.js"
	"np/interface.js"
	"np/map.js"
	"np/recorder.js"
	"np/screens.js"
	"np/universe.js"
	"anim.js"
	"crux.js"
	"npui_shared.js"
	"templates.js"
	"widgets.js"
	"np_widgets.js"
)

# Download each file
for FILE in "${GAME_FILES[@]}"; do
	DIR="$OUTPUT_DIR/$(dirname "$FILE")"
	mkdir -p "$DIR"
	cd "$DIR"

	echo "Downloading $FILE..."
	curl -# -J -O "https://np4.ironhelmet.com/scripts/client/$FILE"

	cd "$OLDPWD"
done

echo "Game files downloaded to $OUTPUT_DIR"
echo "Files downloaded:"
find "$OUTPUT_DIR" -type f -name "*.js" | sort
