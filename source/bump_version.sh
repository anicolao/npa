#!/usr/bin/bash
#Must be run in the /source directory
VERSION=$(grep -Po '(?<=\"[0-9]\.)([0-9]*)' manifest.json)
NEXT_VERSION=$((VERSION+1))
sed -i -E "s/(version.*2\.)([0-9]*)/\1${NEXT_VERSION}/" manifest.json
sed -i -E "s/(const sat_version = \"[0-9]*\.)([0-9]*)/\1${NEXT_VERSION}/" intel.js
zip ../../archive/stoned_ape_2_${NEXT_VERSION}.zip intel.js intel.css worker.js manifest.json 48x48.png favicon.ico favicon.png icon_128.png  