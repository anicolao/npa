# NPA iOS TestFlight release handoff

## Current release

NPA is distributed by the SPNSS Apple Developer/App Store Connect
organization as a public TestFlight beta.

| Field | Value |
| --- | --- |
| Product | NPA |
| Bundle ID | `com.spnss.npa` |
| Apple team | `ZHQLA4T47N` |
| Marketing version | `1.0` |
| Current build | `1` |
| Archive creation | 2026-08-22 22:13:57 America/Toronto |
| Xcode | 26.6 (`17F113`) |
| Internal group | `Internal` |
| External group | `Discord Public Beta` |
| Public link | <https://testflight.apple.com/join/6V4Xu9hc> |
| Public availability | Approved and available as of 2026-08-26 |

The retained local archive is:

```text
ios/.DerivedData/TestFlightBuild1/NPAiOS.xcarchive
```

It is a local release artifact and must not be committed. Its application
metadata confirms bundle ID `com.spnss.npa`, version `1.0 (1)`, arm64, the
SPNSS team, and `ITSAppUsesNonExemptEncryption = false`.

Build `1` is a legacy beta with incomplete source provenance. Its embedded
`background.js` and `intel.css` match clean `main`, but its `intel.js` and
source map match the pre-remediation worktree rather than a clean build from
authoritative `main`. The repository therefore targets build `2`, whose web
payload is generated from the reviewed `main` source. Build `1` remains
documented as the currently distributed public beta until build `2` is merged,
uploaded, processed, and assigned to the public group.

## Repository release model

- The hand-maintained Xcode project remains authoritative; NPA does not use
  XcodeGen.
- The project uses automatic signing with the SPNSS team.
- Apple credentials, private keys, certificates, profiles, archives, and IPAs
  remain outside Git.
- The asset catalog is the canonical app-icon source.
- The web payload under `ios/NPAiOS/Resources/Dist` remains committed so an
  ordinary Xcode checkout is self-contained.
- The committed payload must be generated from the same repository revision as
  the iOS release. Do not hand-edit generated JavaScript or CSS.
- Bun is the supported package manager and build launcher.

## Prepare a release

Install dependencies from the committed Bun lockfile, then build and stage the
web payload:

```bash
bun install --frozen-lockfile
ios/scripts/stage-web-assets.sh
git diff --check
```

The staging script runs `bun run build`, verifies required assets, replaces the
iOS payload with `dist`, and checks byte-for-byte directory parity. It keys the
bundle metadata to the latest commit that changed a production web input, so
iOS-only and documentation-only commits do not create a false payload change.

Every upload must use a `CURRENT_PROJECT_VERSION` greater than every build
previously uploaded for the same marketing version. Build `1` is already in
use, so the next upload must be build `2` or greater.

On this release Mac, select the full Xcode installation explicitly:

```bash
export DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer
```

Run an unsigned Release preflight:

```bash
xcodebuild \
  -project ios/NPAiOS.xcodeproj \
  -scheme NPAiOS \
  -configuration Release \
  -destination 'generic/platform=iOS' \
  -derivedDataPath ios/.DerivedData/ReleasePreflight \
  CODE_SIGNING_ALLOWED=NO \
  build
```

Require the preflight product to contain:

- bundle ID `com.spnss.npa`;
- the intended marketing version and incremented build number;
- minimum iOS 16.0;
- no unexpected entitlements;
- opaque catalog-managed icons, including the 1024px marketing icon;
- the freshly staged `Dist/intel.js` and `Dist/intel.css`.

## Archive and upload

Archive with Release configuration and automatic signing. Credentials may be
supplied to `xcodebuild`, `altool`, or App Store Connect API tooling from local
configuration, but never from tracked files. Export with
`ios/Config/TestFlightExportOptions.plist`, validate the IPA, and upload it.

After upload:

1. Wait until App Store Connect reports the build as valid.
2. Resolve export compliance if requested; NPA declares that it does not use
   non-exempt encryption.
3. Assign the build to the internal group and smoke test it on a clean device.
4. Assign the same build to `Discord Public Beta`. If Apple requires another
   Beta App Review, wait for approval before announcing availability.
5. Verify the public link installs the new build.
6. Record the exact Git commit, version/build, upload date, processing state,
   and public availability in this handoff and `ios/README.md`.
7. Tag the exact release commit only after the distributed build is verified.

## Smoke test

On a real iPhone or iPad, verify:

- fresh launch and Neptune's Pride login;
- persistence of the session after relaunch;
- visible evidence that the bundled NPA JavaScript and CSS loaded;
- navigation and back gestures;
- safe-area top/bottom tap behavior;
- portrait and landscape behavior;
- clean installation and upgrade over the previous TestFlight build.

## Security boundary

Ignore rules cover `AuthKey_*.p8`, `*.p12`, `*.mobileprovision`, `*.xcarchive`,
and `*.ipa`. Before every release commit, run a credential scan and inspect the
tracked file list. Never commit an Apple password, API private key, signing
private key, exported certificate, provisioning profile, archive, or IPA.

App Store Connect's Full Access setting controls which organization users can
see this app; it does not make the TestFlight group public. When assigning an
internal tester programmatically, use a beta-tester resource scoped to this
app rather than reusing a resource returned for another app.

## Deferred automation

A future `ios/scripts/upload-testflight.sh` may automate build-number checks,
staging, tests, archiving, validation, upload, processing polls, and group
assignment. Keep signing and App Store Connect credentials local. GitHub-hosted
TestFlight deployment, Fastlane, Xcode Cloud, and XcodeGen are not required for
the current release process.
