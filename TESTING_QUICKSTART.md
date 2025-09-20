# Testing Quick Start

This project now includes a comprehensive Playwright-based testing strategy for end-to-end testing of the Neptune's Pride Agent Chrome extension.

## Quick Demo

```bash
# Run a quick demo of the testing environment
npm run test:demo
```

This will:
- Set up the test environment with mock game files  
- Start a local test server
- Show you the testing capabilities
- Demonstrate screenshot testing functionality

## Available Test Commands

```bash
npm run test:unit        # Run existing unit tests (Vitest)
npm run test:playwright  # Run Playwright e2e tests (requires browser install)
npm run test:server      # Start test server for manual testing
npm run test:setup       # Set up test environment
npm run test:demo        # Quick demo of testing capabilities
npm run test:all         # Run all tests
```

## Test Environment

The testing strategy includes:

- **Mock game environment** that simulates Neptune's Pride
- **Local test server** for serving game files
- **Extension loading** in headless browsers
- **Screenshot capture** for visual regression testing
- **Performance monitoring** and error detection

## Full Documentation

See [TESTING.md](TESTING.md) for complete documentation of the testing strategy, including:

- Architecture overview
- Setup instructions  
- Test categories and examples
- Screenshot testing workflow
- Debugging and maintenance guides