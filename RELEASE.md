# Alpha release workflow

Chrome and native iOS/TestFlight have release adapters. Firefox and the legacy
Bitbucket mirror are still planned adapters. The targets currently run separately
against the same recorded web release.
The configured Chrome destination is the existing Board Games Cafe alpha item
`ndfajnjbmlanogpddbbjbbcoahhomaba`, published at 2.2.89 when checked on
2026-10-21. The next patch is 2.2.90.

## Test a package without releasing

```sh
bun run release -- build --preview --version 2.2.90
```

This checks dependencies, lint and unit tests and builds an isolated snapshot of
web build inputs. It does not change package.json, commit, tag, push, or upload.
Load `releases/preview-2.2.90/chrome` unpacked in Chrome for a smoke test. The
ZIP is a preview and the deployment command refuses to upload it. Move an old
preview directory aside before repeating a preview build.

## One-time API setup

The signed-in Developer Dashboard is not an API credential. Follow Google's
[Web Store API setup](https://developer.chrome.com/docs/webstore/using-api):

1. Enable Chrome Web Store API in a Google Cloud project.
2. Configure the OAuth consent screen for the release tool.
3. Create a **Desktop app** OAuth client named `NPA release automation` and
   download its JSON file. Keep it outside the repository.
4. Run the local authorization helper:

```sh
bun run release -- auth --client-file /path/to/downloaded-client.json
```

Open the printed Google authorization URL in the Board Games Cafe Chrome profile
and authorize as `alex@boardgamescafe.org`. The helper uses PKCE and a random state,
listens only on localhost, receives the callback automatically, and checks access
to the configured alpha listing before saving credentials. No code/token copying
is needed. It times out after ten minutes if authorization is not completed.

Credentials are saved to `~/.config/npa/chrome-oauth.json` with mode 600 and loaded
automatically by later release commands. Set `NPA_RELEASE_CREDENTIALS` to use a
different private file. A successful authorization replaces that file; a failed
exchange or API check leaves existing credentials untouched.

```sh
bun run release -- preflight
```

The Web Store permission is account-wide, although the release configuration pins
the alpha item. For unattended use, avoid an external OAuth app left in Testing:
its refresh tokens can expire after seven days. Check the project's Audience
settings; use an Internal app for Workspace-only tooling where appropriate.
Refresh tokens can still be revoked, in which case rerun auth.

Alternatively supply `CWS_CLIENT_ID`, `CWS_CLIENT_SECRET`, `CWS_REFRESH_TOKEN`
through your secret manager. Never put secrets in command-line arguments or
release.config.json. The runner never saves tokens in release artifacts or prints
OAuth response bodies. `release.config.json` contains only public destination
IDs and Git settings. Creating/authorizing the OAuth client is a one-time setup;
there are no per-release local confirmation prompts.

## Patch and deploy

Commit tested source changes first, then run on main:

```sh
bun run release -- patch --target chrome --channel alpha --auto-publish
```

The command checks API access and remote versions before bumping, runs checks,
increments package.json, commits the version, builds an isolated package, records
checksums, creates the version tag, pushes main and only that tag atomically, then
uploads and submits the ZIP to Chrome. No force pushes. A release lock prevents
concurrent local runs. All existing commits on main are included in the push.

Chrome uses `DEFAULT_PUBLISH`, normal review, and 100% rollout. That requests
publication automatically after approval; it does not bypass Google's review.
A successful submission is reported as submitted, not published. Run:

```sh
bun run release -- status 2.2.90
```

The status command shows the destination's live published/submitted versions.
Source changes after packaging are not included: resume uses the original ZIP
and verifies its checksum. Keep the release directory for recovery.

## Packaging hook and retries

`postversion` and the compatibility `bin/packagedist` entry point both call the
same runner. They package the already-committed version without another bump.
They do not upload by default. The release wrapper owns its own bump and does
not invoke npm version, avoiding recursive lifecycle hooks.

```sh
bun run release -- patch                          # commit + package locally
bun run postversion                              # package current committed version
bun run release -- postversion --auto-publish     # package + deploy current version
bun run release -- resume 2.2.90 --auto-publish    # no bump, no rebuild
```

The traditional `npm version patch` lifecycle also invokes postversion after its
version commit/tag; it packages locally. Do not use `--no-git-tag-version` with
that lifecycle: a release requires committed inputs. There is no blanket
`git push --tags` or mutation of Firefox source files.

If interrupted after the version commit but before packaging, run postversion.
If a release.json exists, use resume. Do not run patch again just to retry.

`releases/<version>/` contains:

- `chrome-<version>.zip` and the unpacked `chrome/` directory;
- separate `source-maps/`;
- `release.json`: commit, build-input digest, tool version, artifact/file hashes;
- `chrome-state.json`: destination, artifact hash, upload/submission phase.

Re-running postversion reuses the verified artifact if its source commit matches.
Preview and real builds live in separate directories. Existing outputs are never
silently overwritten. Build output does not replace the developer's dist folder.

Acknowledged asynchronous uploads can be resumed. Pending or completed submissions
are reconciled with the store and are not sent again. A lost upload response is
ambiguous: Chrome's status API does not prove which ZIP is in an unsubmitted draft.
The runner deliberately stops in `uploading`. Inspect the alpha dashboard first;
after confirming the intended version/package is present, an operator can change
that receipt's phase to `uploaded`, or to `packaged` if no upload was accepted.
Never reset the receipt for a different version or item. Rejected/cancelled
submissions stop for diagnosis. A timeout is not success.

If the process is killed, a stale .release.lock can remain. Check that its PID is
not running a release before removing the lock. Credentials, release products,
and state are ignored by Git.

## Validation and next adapters

Tests cover manifest/ZIP validation, tamper detection, version handling, locking,
OAuth/API contracts, pending uploads, lost responses, duplicate prevention, and
rejected submissions. A real clean-checkout package and lifecycle smoke test should
precede the first live API submission. API contract tests use mocked responses;
they do not constitute a store upload.

The remaining adapters are Firefox packaging/AMO source submission and the legacy
Bitbucket mirror. The old iOS staging script remains available for local Xcode work.


## Native iOS / TestFlight

The native app uses the exact `intel.js` and `intel.css` from the verified Chrome
ZIP. It does not rebuild the web payload or read the mutable unpacked Chrome
folder. The recorded native source commit can differ from the web commit; both
are saved in `ios-release.json`. The Swift project and resources are staged in
an isolated directory, leaving tracked iOS resources and project versions alone.

Apple credentials are loaded from `~/.config/npa/apple-api.json` (mode 600), or
`NPA_APPLE_CREDENTIALS`. The JSON contains `keyId`, `issuerId`, and
`privateKeyPath`; the `.p8` key remains outside Git. Environment overrides are
`ASC_KEY_ID`, `ASC_ISSUER_ID`, and `ASC_PRIVATE_KEY_PATH`. Individual keys can
perform API lookups without an issuer ID; this upload adapter uses a team key.
Xcode is selected using `DEVELOPER_DIR` or the configured Xcode application path.
Local code signing requires the matching signing identity and provisioning profile;
export may update signing assets through Apple's API.

The configured app is `com.spnss.npa`, team `ZHQLA4T47N`. Its marketing version
tracks the web release (starting with `2.2.90`), with build number `1` by default.
For a replacement native build of the same web release, use `--build-number 2`.
Never run `patch` again just to distribute an existing web release to iOS.

```sh
# Read-only access and existing-build check
bun run release -- preflight --target ios

# Compile an unsigned simulator app from the existing 2.2.90 web release
bun run release -- build --target ios --version 2.2.90 --preview

# After committing source changes: archive, export, push main, upload, distribute
bun run release -- deploy 2.2.90 --target ios --auto-publish

# Continue the same native build after an interruption, without rebuilding/uploading
bun run release -- resume 2.2.90 --target ios --auto-publish
bun run release -- status 2.2.90 --target ios
```

`build --target ios` without `--preview` creates a signed archive locally.
`deploy` creates a missing archive, exports and verifies the IPA, records intent
before uploading, and polls Apple processing for up to 30 minutes. Once valid,
it associates the build with the existing `Internal` and `Discord Public Beta`
groups, supplies basic release notes if missing, enables automatic tester
notification, and submits external beta review where required. Existing beta
review contact information is reused. It does not bypass Apple review or submit
a public App Store release. `submitted` means awaiting review, not distributed.

The command requires clean, committed main and pushes that native source commit.
It does not move the existing web release tag. `resume` requires the same native
source commit and destination configuration. Packages, checksums, export and
upload receipts live under `releases/2.2.90/ios-1/`; simulator artifacts live under
`ios-preview-1/` and cannot be uploaded. Existing build directories are never
overwritten. On retry, an incomplete directory without a release, export, or
upload receipt is moved to a uniquely named `.incomplete-...` sibling for
diagnosis. Completed builds and deployment receipts are never replaced. A terminated process may leave `.release.lock`; check its PID
before removing it.

If upload returns no response, resume checks Apple's build list before proceeding.
It never blindly uploads again. A missing build with an `uploading` receipt needs
manual investigation; do not reset it merely because processing is slow. Failed
processing, rejected reviews, missing review metadata, and uncertain review
submissions stop for diagnosis. Resume can continue once Apple's state resolves.

Local validation includes a simulator build, signed device archive, IPA export,
and byte-for-byte verification of embedded web assets. Unit tests exercise JWTs,
artifact tampering, duplicate upload prevention and review recovery. These checks
are separate from a live TestFlight upload and beta review.
