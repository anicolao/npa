# Testing Strategy for Neptune's Pride Agent

This document outlines the comprehensive testing strategy for the Neptune's Pride Agent Chrome extension, with a focus on Playwright-based end-to-end testing that can capture screenshots and verify functionality before major refactors.

## Overview

The Neptune's Pride Agent is a Chrome extension that injects functionality into the Neptune's Pride online game. Testing this extension requires a sophisticated setup that can:

1. Download and serve the actual game files locally
2. Load the extension in a test browser
3. Capture screenshots to verify visual functionality
4. Test key features like screenshot capture, intel reports, and UI modifications

## Testing Architecture

### Current Testing Setup

The project currently uses:
- **Vitest** for unit testing with TypeScript support
- **Chai** for assertions
- **JSDOM** for DOM manipulation testing
- **Coverage** reporting with V8

### Playwright Integration Strategy

The new Playwright-based testing strategy adds:
- **End-to-end testing** of the extension in a real browser
- **Visual regression testing** through screenshots
- **Extension loading** and injection verification
- **Game interaction simulation**

## Setup and Configuration

### Prerequisites

1. **Node.js** (v20+) and npm
2. **Playwright** browsers installed
3. **Game files** downloaded for testing

### Installation

```bash
# Install Playwright dependencies
npm install --save-dev playwright @playwright/test

# Install Playwright browsers
npx playwright install

# Download game files for testing
./scripts/download-game-files.sh
```

### Configuration Files

- `playwright.config.ts` - Main Playwright configuration
- `tests/playwright/` - Playwright test files
- `scripts/download-game-files.sh` - Game files download script
- `tests/test-server/` - Local test server setup

## Test Structure

### 1. Game Files Setup

The `scripts/download-game-files.sh` script downloads the actual Neptune's Pride game files:

```bash
./scripts/download-game-files.sh [output-directory]
```

This downloads:
- Core game files (`game.js`, `universe.js`, `map.js`, etc.)
- UI components (`widgets.js`, `templates.js`)
- Interface modules (`interface.js`, `screens.js`)

### 2. Test Server

A local HTTP server serves the downloaded game files and a test HTML page that mimics the Neptune's Pride environment. This allows testing without requiring access to the live game servers.

### 3. Extension Loading

Tests load the built extension into a Chromium instance using Playwright's extension support:

```typescript
// Example extension loading
const context = await chromium.launchPersistentContext(userDataDir, {
  args: [`--load-extension=${extensionPath}`]
});
```

### 4. Screenshot Testing

The strategy includes comprehensive screenshot testing:

- **Baseline screenshots** of key UI states
- **Before/after comparisons** for feature testing
- **Visual regression detection** for refactoring safety

## Test Categories

### Unit Tests (Existing - Vitest)

Located in `tests/*.spec.ts`:
- `autocomplete.spec.ts` - Input autocomplete functionality
- `bsp.spec.ts` - Binary space partitioning utilities
- `heap.spec.ts` - Heap data structure
- `hotkey.spec.ts` - Keyboard shortcut handling
- `patch.spec.ts` - Object patching utilities
- `reports.spec.ts` - Report generation

### Integration Tests (New - Playwright)

Located in `tests/playwright/`:

#### 1. Extension Loading Tests
- Verify extension loads correctly
- Check injection into game pages
- Validate permission requirements

#### 2. Core Functionality Tests
- **Screenshot capture** - Test the built-in screenshot feature
- **Intel reports** - Verify report generation and formatting
- **UI modifications** - Check that extension UI elements appear
- **Data storage** - Test settings and data persistence

#### 3. Game Interaction Tests
- **Map interactions** - Test star and fleet selections
- **Message composition** - Verify autocomplete and formatting
- **Hotkey functionality** - Test keyboard shortcuts
- **Report pasting** - Verify report insertion into messages

#### 4. Visual Regression Tests
- Capture screenshots of key screens
- Compare against baseline images
- Detect unintended visual changes

### Performance Tests

- Extension loading time
- UI responsiveness with extension active
- Memory usage impact

## Test Execution

### Running Tests

```bash
# Run all tests
npm test

# Run only unit tests
npm run test:unit

# Run only Playwright tests
npm run test:playwright

# Run with coverage
npm run test:coverage

# Run specific test file
npx playwright test tests/playwright/screenshot.spec.ts
```

### CI/CD Integration

The testing strategy supports continuous integration:

- Parallel test execution
- Artifact collection (screenshots, videos)
- Test result reporting
- Coverage tracking

## Test Data and Fixtures

### Game Data Fixtures

The `tests/scandata.ts` file contains realistic game state data for testing scenarios with:
- Multiple players and empires
- Star systems and fleets
- Technology levels and resources

### Test Scenarios

Common test scenarios include:
- New player game state
- Mid-game with multiple alliances
- End-game victory conditions
- Error states and edge cases

## Screenshot Testing Strategy

### Baseline Management

1. **Initial baselines** - Capture reference screenshots
2. **Review process** - Manual review of screenshot differences
3. **Update workflows** - Easy baseline updates for intentional changes
4. **Cross-platform consistency** - Handle OS-specific rendering differences

### Coverage Areas

Screenshots cover:
- Main game map with extension overlays
- Intel report screens
- Settings and configuration dialogs
- Message composition with autocomplete
- Empire and statistics displays

## Debugging and Development

### Test Development Workflow

1. **Write failing test** - Define expected behavior
2. **Implement feature** - Add functionality to extension
3. **Verify test passes** - Ensure implementation works
4. **Capture baseline** - Save reference screenshots
5. **Document test** - Add test description and maintenance notes

### Debugging Tools

- **Playwright Inspector** - Step through test execution
- **Browser DevTools** - Debug extension in test context
- **Console logs** - Capture extension and game logging
- **Network monitoring** - Verify API calls and data flow

### Test Maintenance

- Regular baseline updates for intentional UI changes
- Test data refresh for evolving game mechanics
- Performance baseline tracking
- Cross-browser compatibility checks

## Future Enhancements

### Planned Improvements

1. **Mobile testing** - Support for mobile game interface
2. **API testing** - Mock Neptune's Pride API responses
3. **Load testing** - Performance under heavy usage
4. **Accessibility testing** - Screen reader and keyboard navigation
5. **Security testing** - Extension permission and data handling

### Tool Integration

- **Lighthouse** integration for performance metrics
- **Axe** integration for accessibility testing
- **Security scanners** for extension safety
- **Analytics** for test execution metrics

## Maintenance and Updates

### Regular Tasks

- Update game files when Neptune's Pride updates
- Refresh test data for new game features
- Update screenshot baselines for UI changes
- Review and update test scenarios

### Version Compatibility

- Test against multiple Chrome versions
- Verify compatibility with game updates
- Handle Neptune's Pride API changes
- Maintain backward compatibility for settings

## Conclusion

This testing strategy provides comprehensive coverage of the Neptune's Pride Agent extension, enabling confident refactoring and feature development. The combination of unit tests for core logic and Playwright tests for end-to-end functionality ensures both code quality and user experience reliability.

The screenshot-based testing approach is particularly valuable for a visual extension like this, allowing detection of subtle UI changes that could impact user experience. The strategy balances thorough testing with maintainable test suites that support rapid development cycles.