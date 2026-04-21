# NPA iOS Wrapper

This directory contains a minimal SwiftUI iOS app that:

- loads `https://np.ironhelmet.com/` in a `WKWebView`
- injects the built NPA JavaScript and CSS from this repo at startup
- bundles the injected assets locally so the app is self-contained

## Open The App

1. Open [NPAiOS.xcodeproj](/Users/anicolao/projects/games/np/npa/ios/NPAiOS.xcodeproj).
2. Select the `NPAiOS` target.
3. Set your signing team and bundle identifier if needed.
4. Run on an iPhone or iPad simulator/device.

## Injected Assets

The app bundles copies of:

- [intel.js](/Users/anicolao/projects/games/np/npa/ios/NPAiOS/Resources/Dist/intel.js)
- [intel.css](/Users/anicolao/projects/games/np/npa/ios/NPAiOS/Resources/Dist/intel.css)

Those files are copied from the repo's built `dist/` output into [Resources/Dist](/Users/anicolao/projects/games/np/npa/ios/NPAiOS/Resources/Dist) so the wrapper app can run without the browser extension runtime.
