#!/bin/bash
#
# Create mock Neptune's Pride game files for testing
# This creates minimal mock versions of the game files for testing when
# the actual game servers are not accessible
#

set -e

OUTPUT_DIR="${1:-test-game-files}"

echo "Creating mock Neptune's Pride game files in $OUTPUT_DIR..."

# Create directory structure
mkdir -p "$OUTPUT_DIR/np"

# Create mock crux.js
cat > "$OUTPUT_DIR/crux.js" << 'EOF'
// Mock Crux library for testing
window.Crux = {
  touchEnabled: false,
  crux: {
    trigger: function(event, data) {
      console.log('Crux trigger:', event, data);
    }
  },
  format: function(template, ...args) {
    return template.replace(/{(\d+)}/g, (match, number) => {
      return typeof args[number] !== 'undefined' ? args[number] : match;
    });
  },
  formatTime: function(ms) {
    const hours = Math.floor(ms / 3600000);
    const minutes = Math.floor((ms % 3600000) / 60000);
    return `${hours}h ${minutes}m`;
  },
  templates: {},
  tickCallbacks: []
};
EOF

# Create mock templates.js
cat > "$OUTPUT_DIR/templates.js" << 'EOF'
// Mock templates for testing
function getAll() {
  return {
    'screen_base': '<div class="screen_base">{0}</div>',
    'button': '<button class="button" onclick="{1}">{0}</button>',
    'text': '<span class="text">{0}</span>'
  };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { getAll };
} else {
  window.getAll = getAll;
}
EOF

# Create mock widgets.js
cat > "$OUTPUT_DIR/widgets.js" << 'EOF'
// Mock UI widgets for testing
window.UI = {
  Button: function(id, trigger, text) {
    return {
      grid: function() { return this; },
      roost: function() { return this; },
      onClick: null
    };
  },
  Text: function(id, className) {
    return {
      rawHTML: function() { return this; },
      roost: function() { return this; }
    };
  },
  Widget: function(className) {
    return {
      size: function() { return this; },
      roost: function() { return this; }
    };
  },
  IconButton: function(icon, trigger, text) {
    return {
      grid: function() { return this; },
      roost: function() { return this; },
      onClick: null
    };
  }
};
EOF

# Create mock npui_shared.js
cat > "$OUTPUT_DIR/npui_shared.js" << 'EOF'
// Mock Neptune's Pride UI shared components
window.npui = {
  Screen: function(name) {
    return {
      size: function() { return this; },
      roost: function() { return this; }
    };
  },
  DirectoryTabs: function(type) {
    return {
      roost: function() { return this; }
    };
  },
  NewMessageCommentBox: function() {
    return document.createElement('div');
  }
};
EOF

# Create mock game files
cat > "$OUTPUT_DIR/np/game.js" << 'EOF'
// Mock Neptune's Pride game logic
console.log('Mock game.js loaded');
EOF

cat > "$OUTPUT_DIR/np/universe.js" << 'EOF'
// Mock universe logic
console.log('Mock universe.js loaded');
EOF

cat > "$OUTPUT_DIR/np/map.js" << 'EOF'
// Mock map logic
console.log('Mock map.js loaded');
EOF

cat > "$OUTPUT_DIR/np/interface.js" << 'EOF'
// Mock interface logic
console.log('Mock interface.js loaded');
EOF

cat > "$OUTPUT_DIR/np/screens.js" << 'EOF'
// Mock screens logic
console.log('Mock screens.js loaded');
EOF

cat > "$OUTPUT_DIR/np/inbox.js" << 'EOF'
// Mock inbox logic
console.log('Mock inbox.js loaded');
EOF

cat > "$OUTPUT_DIR/np/recorder.js" << 'EOF'
// Mock recorder logic
console.log('Mock recorder.js loaded');
EOF

echo "Mock game files created successfully!"
echo "Files created:"
find "$OUTPUT_DIR" -type f -name "*.js" | sort