# Testing Quick Start

This project includes a comprehensive Playwright-based testing strategy for end-to-end testing of the Neptune's Pride Agent Chrome extension.

## Quick Setup

```bash
# Set up the testing environment (downloads real game files)
npm run test:setup
```

This will:
- Download Neptune's Pride game files from official servers
- Start a local test server
- Set up the testing capabilities
- Prepare for screenshot testing functionality

## Available Test Commands

```bash
npm run test:unit        # Run existing unit tests (Vitest)
npm run test:playwright  # Run Playwright e2e tests (requires browser install)
npm run test:server      # Start test server for manual testing
npm run test:setup       # Set up test environment
npm run test:all         # Run all tests
```

## Test Environment

The testing strategy includes:

- **Real game environment** that uses actual Neptune's Pride files
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