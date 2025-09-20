#!/bin/bash

# Download external resources for Neptune's Pride test environment

BASE_DIR="/home/runner/work/npa/npa"
STATIC_DIR="$BASE_DIR/tests/test-server/static"

# Create directories
mkdir -p "$STATIC_DIR/styles"
mkdir -p "$STATIC_DIR/libs" 
mkdir -p "$STATIC_DIR/images/map"

echo "Downloading CSS files..."
curl -s "https://np.ironhelmet.com/styles/neptune.css" -o "$STATIC_DIR/styles/neptune.css"
curl -s "https://np.ironhelmet.com/styles/fontello.css" -o "$STATIC_DIR/styles/fontello.css"

echo "Downloading JavaScript libraries..."
curl -s "https://np.ironhelmet.com/scripts/client/libs/store.min.js" -o "$STATIC_DIR/libs/store.min.js"
curl -s "https://np.ironhelmet.com/scripts/client/libs/buzz.min.js" -o "$STATIC_DIR/libs/buzz.min.js"
curl -s "https://np.ironhelmet.com/scripts/client/libs/hammer.min.js" -o "$STATIC_DIR/libs/hammer.min.js"
curl -s "https://np.ironhelmet.com/scripts/client/libs/mousetrap.min.js" -o "$STATIC_DIR/libs/mousetrap.min.js"

echo "Downloading map images..."
curl -s "https://np.ironhelmet.com/images/map/clouds2.jpg" -o "$STATIC_DIR/images/map/clouds2.jpg"
curl -s "https://np.ironhelmet.com/images/map/clouds3.jpg" -o "$STATIC_DIR/images/map/clouds3.jpg"
curl -s "https://np.ironhelmet.com/images/nebular.png" -o "$STATIC_DIR/images/nebular.png"
curl -s "https://np.ironhelmet.com/images/map/halo.png" -o "$STATIC_DIR/images/map/halo.png"
curl -s "https://np.ironhelmet.com/images/map/halo2.png" -o "$STATIC_DIR/images/map/halo2.png"
curl -s "https://np.ironhelmet.com/images/map/stars.png" -o "$STATIC_DIR/images/map/stars.png"
curl -s "https://np.ironhelmet.com/images/map/wh.png" -o "$STATIC_DIR/images/map/wh.png"
curl -s "https://np.ironhelmet.com/images/map/fleet_range.png" -o "$STATIC_DIR/images/map/fleet_range.png"
curl -s "https://np.ironhelmet.com/images/map/scanning_range.png" -o "$STATIC_DIR/images/map/scanning_range.png"
curl -s "https://np.ironhelmet.com/images/map/fleet_waypoint.png" -o "$STATIC_DIR/images/map/fleet_waypoint.png"
curl -s "https://np.ironhelmet.com/images/map/fleet_waypoint_next.png" -o "$STATIC_DIR/images/map/fleet_waypoint_next.png"
curl -s "https://np.ironhelmet.com/images/map/selection_ring.png" -o "$STATIC_DIR/images/map/selection_ring.png"

echo "External resources downloaded successfully!"