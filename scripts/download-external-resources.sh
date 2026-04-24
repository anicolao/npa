#!/bin/bash

# Download external resources for Neptune's Pride test environment

set -euo pipefail

BASE_DIR="$(cd "$(dirname "$0")/.." && pwd)"
STATIC_DIR="$BASE_DIR/tests/test-server/static"
NP4_BASE_URL="https://np4.ironhelmet.com"

download() {
	local path="$1"
	local output="$2"
	curl -fsSL --compressed "$NP4_BASE_URL/$path" -o "$output"
}

# Create directories
mkdir -p "$STATIC_DIR/styles"
mkdir -p "$STATIC_DIR/libs"
mkdir -p "$STATIC_DIR/images/map"
mkdir -p "$STATIC_DIR/fonts/Fontello"
mkdir -p "$STATIC_DIR/fonts/OpenSans"
mkdir -p "$STATIC_DIR/fonts/PlayerIcons"

echo "Downloading CSS files..."
download "styles/neptune.css" "$STATIC_DIR/styles/neptune.css"
download "styles/fontello.css" "$STATIC_DIR/styles/fontello.css"

echo "Downloading JavaScript libraries..."
download "scripts/client/libs/jquery.min.js" "$STATIC_DIR/libs/jquery.min.js"
download "scripts/client/libs/store.min.js" "$STATIC_DIR/libs/store.min.js"
download "scripts/client/libs/buzz.min.js" "$STATIC_DIR/libs/buzz.min.js"
download "scripts/client/libs/hammer.min.js" "$STATIC_DIR/libs/hammer.min.js"
download "scripts/client/libs/mousetrap.min.js" "$STATIC_DIR/libs/mousetrap.min.js"

echo "Downloading map images..."
download "images/map/clouds2.jpg" "$STATIC_DIR/images/map/clouds2.jpg"
download "images/map/clouds3.jpg" "$STATIC_DIR/images/map/clouds3.jpg"
download "images/nebular.png" "$STATIC_DIR/images/nebular.png"
download "images/map/halo.png" "$STATIC_DIR/images/map/halo.png"
download "images/map/halo2.png" "$STATIC_DIR/images/map/halo2.png"
download "images/map/stars.png" "$STATIC_DIR/images/map/stars.png"
download "images/map/wh.png" "$STATIC_DIR/images/map/wh.png"
download "images/map/fleet_range.png" "$STATIC_DIR/images/map/fleet_range.png"
download "images/map/scanning_range.png" "$STATIC_DIR/images/map/scanning_range.png"
download "images/map/fleet_waypoint.png" "$STATIC_DIR/images/map/fleet_waypoint.png"
download "images/map/fleet_waypoint_next.png" "$STATIC_DIR/images/map/fleet_waypoint_next.png"
download "images/map/selection_ring.png" "$STATIC_DIR/images/map/selection_ring.png"

echo "Downloading font assets..."
download "fonts/Fontello/fontello_002.svg" "$STATIC_DIR/fonts/Fontello/fontello_002.svg"
download "fonts/Fontello/fontello_002.woff" "$STATIC_DIR/fonts/Fontello/fontello_002.woff"
download "fonts/OpenSans/OpenSans-Regular-webfont.svg" "$STATIC_DIR/fonts/OpenSans/OpenSans-Regular-webfont.svg"
download "fonts/OpenSans/OpenSans-Regular-webfont.woff" "$STATIC_DIR/fonts/OpenSans/OpenSans-Regular-webfont.woff"
download "fonts/PlayerIcons/PlayerIcons.svg" "$STATIC_DIR/fonts/PlayerIcons/PlayerIcons.svg"
download "fonts/PlayerIcons/PlayerIcons.woff" "$STATIC_DIR/fonts/PlayerIcons/PlayerIcons.woff"

echo "External resources downloaded successfully!"
