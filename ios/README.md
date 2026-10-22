# NPA iOS Wrapper

This directory contains a minimal SwiftUI iOS app that:

- loads `https://np.ironhelmet.com/` in a `WKWebView`
- injects the built NPA JavaScript and CSS from this repo at startup
- bundles the injected assets locally so the app is self-contained

## Open The App

1. Open [NPAiOS.xcodeproj](NPAiOS.xcodeproj).
2. Select the `NPAiOS` target.
3. Set your signing team and bundle identifier if needed.
4. Run on an iPhone or iPad simulator/device.

## Injected Assets

The app bundles copies of:

- [intel.js](NPAiOS/Resources/Dist/intel.js)
- [intel.css](NPAiOS/Resources/Dist/intel.css)

Those files are copied from the repo's built `dist/` output into
[Resources/Dist](NPAiOS/Resources/Dist) so the wrapper app can run without the
browser extension runtime.

## TestFlight release

The App Store Connect app is owned by SPNSS and uses bundle ID
`com.spnss.npa`. Signing is automatic and the committed project selects the
SPNSS development team. Apple credentials and generated signing products must
remain outside the repository.

For automated releases from a recorded web build, use the
[native iOS release workflow](../RELEASE.md#native-ios--testflight). It stages the
payload in an isolated copy, archives and exports the app, and supports resumable
TestFlight uploads. Marketing versions follow the web release from 2.2.90 onward;
`CURRENT_PROJECT_VERSION` is passed at build time without editing the project.

For manual local Xcode builds, build and stage the current web payload:

```bash
ios/scripts/stage-web-assets.sh
```

Staging records the latest commit that changed a production web input and is
deterministic across iOS-only and documentation-only commits.

Every App Store Connect upload must have a `CURRENT_PROJECT_VERSION` greater
than every previously uploaded build for the same marketing version. Release
archives use the shared `NPAiOS` scheme and Release configuration. On this
machine, set `DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer` because
the globally selected developer directory is supplied by Nix.

Build `1.0 (1)` was validated, uploaded, and placed in the SPNSS `Internal`
TestFlight group on 2026-08-22 (America/Toronto). Its processing state is
`VALID` and its internal testing state is `IN_BETA_TESTING`.

The app record's **Full Access** setting is intentional: it controls which
App Store Connect users can see the app and is independent of TestFlight's
internal/external distribution choice. When automating tester assignment,
create or locate the tester in the context of this app. A beta-tester resource
ID obtained from another app can be rejected even when it represents the same
email address.

## Discord public beta

Build `1.0 (1)` is also assigned to the external `Discord Public Beta` group:

<https://testflight.apple.com/join/6V4Xu9hc>

The group accepts up to 10,000 testers and its public link is enabled. Build
`1.0 (1)` passed the first TestFlight Beta App Review and is available to
public-link testers as of 2026-08-26.

The retained build `1` archive contains a web bundle produced from the
pre-remediation worktree, so its source provenance is incomplete. The committed project
retains the manual build `2` default. Automated releases override both version
fields and record native and web source commits separately; they preserve the
existing web release tag.
