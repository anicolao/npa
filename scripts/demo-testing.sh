#!/bin/bash
#
# Demo script to show the Neptune's Pride Agent testing strategy
# This runs a quick demonstration of the test environment without requiring
# full Playwright browser installation
#

set -e

echo "🚀 Neptune's Pride Agent Testing Strategy Demo"
echo "=============================================="
echo

# Check if setup has been run
if [ ! -d "test-game-files" ]; then
    echo "Setting up test environment..."
    ./scripts/setup-tests.sh
    echo
fi

# Start the test server in background
echo "📡 Starting test server..."
npm run test:server &
SERVER_PID=$!

# Wait for server to start
sleep 3

# Test server response
echo "🌐 Testing server response..."
if curl -s http://localhost:8080 > /dev/null; then
    echo "✅ Test server is running at http://localhost:8080"
else
    echo "❌ Test server failed to start"
    kill $SERVER_PID 2>/dev/null || true
    exit 1
fi

# Show what files are being served
echo
echo "📁 Game files available for testing:"
find test-game-files -name "*.js" | sort

echo
echo "🖥️ Test environment structure:"
echo "  • Test server serving game files from test-game-files/"
echo "  • Static test page at http://localhost:8080"
echo "  • Mock Neptune's Pride environment ready"
echo "  • Extension injection points configured"

echo
echo "🧪 Available test commands:"
echo "  npm run test:unit        # Run existing unit tests"
echo "  npm run test:playwright  # Run Playwright e2e tests (requires browser install)"
echo "  npm run test:server      # Start test server manually"
echo "  npm run test:all         # Run all tests"

echo
echo "📸 Screenshot testing capabilities:"
echo "  • Visual regression testing"
echo "  • Extension UI verification"
echo "  • Game map screenshot capture"
echo "  • Before/after refactoring comparison"

echo
echo "🎯 Ready for testing! Visit http://localhost:8080 to see the test environment"
echo

# Keep server running for a bit so user can test
echo "Server will run for 30 seconds for testing..."
echo "Press Ctrl+C to stop early"

trap 'echo; echo "🛑 Stopping test server..."; kill $SERVER_PID 2>/dev/null || true; exit 0' INT

sleep 30

echo "⏰ Demo time expired. Stopping test server..."
kill $SERVER_PID 2>/dev/null || true

echo "✨ Demo complete! See TESTING.md for full documentation."