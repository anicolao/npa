# Alpha release workflow

Chrome is the first implemented target. Firefox, native iOS/TestFlight, and the
legacy Bitbucket mirror are planned adapters, not part of this command yet.
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

The next adapters should consume the same recorded payload: Firefox packaging and
AMO source submission, then staging the native iOS shell, archiving/signing and
TestFlight distribution. Keep the existing iOS scripts until that adapter is tested.
