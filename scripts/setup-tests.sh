#!/bin/bash
#
# Setup script for Neptune's Pride Agent testing environment
# Downloads game files and prepares the test environment
#

set -e

echo "Setting up Neptune's Pride Agent testing environment..."

# Create necessary directories
echo "Creating test directories..."
mkdir -p test-results
mkdir -p test-game-files

# Download game files if they don't exist
if [ ! -d "test-game-files/np" ] || [ ! -f "test-game-files/crux.js" ]; then
    echo "Downloading Neptune's Pride game files from official servers..."
    if ./scripts/download-game-files.sh test-game-files; then
        echo "✅ Real game files downloaded successfully."
        echo "📊 Files downloaded:"
        find test-game-files -name "*.js" | sort
    else
        echo "⚠️  Failed to download real game files from server. Creating mock files instead..."
        ./scripts/create-mock-game-files.sh test-game-files
        echo "📋 Mock files created for testing."
    fi
else
    echo "Game files already exist. Checking if they are real or mock files..."
    if grep -q "Mock" test-game-files/crux.js 2>/dev/null; then
        echo "📋 Found mock files. Attempting to download real files..."
        if ./scripts/download-game-files.sh test-game-files; then
            echo "✅ Upgraded to real game files successfully."
        else
            echo "⚠️  Could not upgrade to real files. Continuing with mock files."
        fi
    else
        echo "✅ Real game files already present."
    fi
fi

# Check if extension is built
if [ ! -d "dist" ] || [ ! -f "dist/intel.js" ]; then
    echo "WARNING: Extension not built. Please run 'npm run build' before running tests."
    echo "Note: Build requires 'bun' to be installed. See DEVELOPMENT.md for setup instructions."
fi

# Install Playwright browsers if not already installed
if ! npx playwright --version > /dev/null 2>&1; then
    echo "Installing Playwright..."
    npm install --save-dev playwright @playwright/test
fi

echo "Checking Playwright browser installation..."
if ! npx playwright list-files chromium > /dev/null 2>&1; then
    echo "Installing Playwright browsers..."
    npx playwright install chromium || echo "WARNING: Playwright browser installation failed. Tests may not work."
else
    echo "Playwright browsers already installed."
fi

echo ""
echo "Test environment setup complete!"
echo ""
echo "To run tests:"
echo "  npm run test:setup     # Run this setup script"
echo "  npm run test:server    # Start test server"
echo "  npm run test:playwright # Run Playwright tests"
echo "  npm run test:all       # Run all tests"
echo ""
echo "To build the extension:"
echo "  npm run build         # Requires 'bun' to be installed"
echo ""
echo "For more information, see TESTING.md"