# NPA Repository Remediation Plan

Audit date: 2026-08-25 (America/Toronto)

Plan revised: 2026-08-26 (America/Toronto)

This is a review plan only. The audit did not fetch, merge, rebase, commit,
push, close, or delete anything. Live GitHub state was read through the GitHub
API and `git ls-remote`, because the repository's local remote-tracking refs are
stale.

## Governing decisions

The following decisions are now settled and govern the rest of this plan:

1. The latest live `origin/main`, after the dirty worktree has been preserved
   safely, is the authoritative implementation and documentation baseline.
   Local or remote topic branches do not override `main` merely because they
   contain newer commits or more extensive changes.
2. Bun is NPA's canonical package manager, TypeScript runtime, dependency
   lockfile owner, and script launcher. Node-specific or `tsx` substitutions
   from documentation branches are not candidates for integration.
3. Existing documentation branches and PRs are presumed unsuitable for direct
   integration. They may be inspected for requirements, review feedback, and
   lessons, but their code, generated prose, and screenshots will be redone on
   fresh branches from current `main`.
4. Useful behavior seen on an old branch must be independently reproduced and
   reimplemented against current `main`; it is not to be recovered through a
   broad merge or conflict resolution.
5. The iOS wrapper is already in public TestFlight beta and is the first
   integration priority after preserving the worktree and synchronizing
   `main`. Its web payload remains committed, but must be generated
   deterministically from authoritative main source.

## Target state

The remediation is complete when all of the following are true:

- local `main` and `origin/main` identify the same commit;
- `git status --porcelain` is empty on `main`;
- every intended local change has been reviewed, tested, and merged through a
  focused PR, while rejected work has an explicit recorded disposition;
- GitHub has no open issues and no open PRs;
- resolved PR branches and obsolete remote branches are deleted;
- local experimental branches are either proven merged and deleted, or
  preserved by an intentional `archive/...` tag before deletion;
- the only long-lived upstream branches are `main` and the documented `web`
  deployment branch;
- required build, unit, Playwright, documentation, and iOS checks pass from a
  fresh checkout of `main`;
- the repository installs and runs its supported workflows through Bun using
  the committed Bun lockfile;
- the public-beta iOS wrapper, release configuration, and reproducible embedded
  web payload are present on `main`, and the distributed beta's source
  provenance is recorded;
- `main` is protected against direct pushes and requires the agreed checks.

“All issues closed” does not mean silently closing reproducible defects. An
issue may be closed as fixed, duplicate, cannot reproduce, or declined, but the
closing comment must contain the evidence and rationale.

## Audit snapshot

### Main and working tree

- Local `main` is `c8a55690`.
- The local `origin/main` ref is also `c8a55690`, which is why local Git reports
  `main...origin/main` as current.
- Live `origin/main` is `1a924995`, five commits ahead of local `main`. Those
  commits are the merged work for issues 54, 57, and 59. There are no local
  commits on `main` ahead of the live branch.
- The tracked working-tree diff contains 9 modified files, 176 insertions, and
  21,441 deletions. Most deletions are in the generated
  `ios/NPAiOS/Resources/Dist/intel.js`.
- Untracked work includes `IOS_TESTFLIGHT_PLAN.md`, `UPDATES_REQUIRED.md`, iOS
  export configuration, a shared Xcode scheme, three app-icon PNGs, and an iOS
  asset-staging script.
- `git diff --check` currently reports trailing whitespace in the generated iOS
  `intel.js`.

The dirty work appears to contain at least three distinct concerns and must not
be committed as one unit:

1. iOS/TestFlight identity, signing metadata, icons, release documentation,
   release configuration, and staged web assets;
2. source/report behavior changes in `src/intel.ts`;
3. planning/audit documents (`IOS_TESTFLIGHT_PLAN.md` and
   `UPDATES_REQUIRED.md`).

The staged iOS JavaScript must be treated as generated output. Its large shrink
must be explained by a reproducible build before it is accepted.

The iOS app is now in public TestFlight beta. That raises the local iOS work
from a future release plan to release-recovery work: the repository should
promptly contain the wrapper and release process that produced the distributed
app, or a replacement beta must be built from the first reproducible iOS commit
on `main`.

### GitHub issues and pull requests

There are 18 [open issues](https://github.com/anicolao/npa/issues):

- product work: [#12](https://github.com/anicolao/npa/issues/12),
  [#13](https://github.com/anicolao/npa/issues/13),
  [#14](https://github.com/anicolao/npa/issues/14),
  [#16](https://github.com/anicolao/npa/issues/16),
  [#22](https://github.com/anicolao/npa/issues/22),
  [#23](https://github.com/anicolao/npa/issues/23), and
  [#24](https://github.com/anicolao/npa/issues/24);
- documentation scenarios: [#30](https://github.com/anicolao/npa/issues/30)
  through [#36](https://github.com/anicolao/npa/issues/36), excluding already
  closed #29, plus [#38](https://github.com/anicolao/npa/issues/38) through
  [#41](https://github.com/anicolao/npa/issues/41).

There are 10 [open PRs](https://github.com/anicolao/npa/pulls):

| PR | Issue/scope | Current state | Required disposition |
| --- | --- | --- | --- |
| [#19](https://github.com/anicolao/npa/pull/19) | `intel.ts` modularization | Draft, conflicting, 67 commits behind; no checks | Audit the extracted modules for still-useful work, then close as obsolete or replace with a current, narrowly scoped refactor PR. Do not merge the 2025 lockfile churn. |
| [#43](https://github.com/anicolao/npa/pull/43) | Issue #31, Accounting and Trading docs | Mergeable, but preview check fails | Record the failure and any useful scenario requirements on #31, then close as superseded. Redo section 006 from current `main`. |
| [#44](https://github.com/anicolao/npa/pull/44) | Issue #30, Empires docs | Conflicting; no current checks | Record the human screenshot/assertion feedback on #30, then close as superseded. Redo section 005 from current `main`; independently verify any claimed report-opening defect before changing source. |
| [#45](https://github.com/anicolao/npa/pull/45) | Issue #32, Economists and Generals docs | Mergeable; preview passes | Record that its test substitutes Accounting for the intended Economists behavior, then close as superseded. Redo the real section 007 scenario from current `main`. |
| [#46](https://github.com/anicolao/npa/pull/46) | Issue #35, Embedded content docs | Conflicting; preview previously passed | Close as superseded after capturing requirements. Redo section 010 from current `main`; reject its Node/`tsx` tooling changes. |
| [#48](https://github.com/anicolao/npa/pull/48) | Issue #39, Time Machine docs | Mergeable; preview passes | Preserve the review note that the test works around broken time travel, then close as superseded. Fix #23 and redo section 014 without workarounds. |
| [#49](https://github.com/anicolao/npa/pull/49) | Issue #36, embedding API keys | Conflicting; preview previously passed | Close as superseded after capturing requirements. Redo section 011 from current `main`; reject its Node/`tsx` tooling changes. |
| [#50](https://github.com/anicolao/npa/pull/50) | Issue #38, API keys | Conflicting; no current checks | Close as superseded after capturing section 013 requirements. Reject the broad Bun-removal changes and redo the scenario from current `main`. |
| [#52](https://github.com/anicolao/npa/pull/52) | Issue #41, Alliance coordination docs | Mergeable; preview passes | Capture the four intended scenario steps, then close as superseded. Redo section 016 from current `main` after #16 is resolved. |
| [#56](https://github.com/anicolao/npa/pull/56) | Issue #33, Messaging docs plus constructor fix | Conflicting; no current checks | Independently reproduce the claimed `NewMessageCommentBox` defect on `main`, then close as superseded. Fix the product defect separately if real and redo section 008 from current `main`. |

Four documentation PRs are presently reported mergeable (#43, #45, #48, and
#52), but mergeability is not evidence of correctness or suitability. All nine
documentation PRs are to be closed as superseded after their useful review
context is transferred to the corresponding issue. PR #19 remains a separate
stale-refactor disposition.

### Remote branches

Live `origin` has 21 branches including `main`.

Branches with open PRs are:

`copilot/fix-80f07096-5b1d-445a-be84-6c509083a29c`, `issue-31`,
`feat/30-empires-docs`, `feature/007-economists-and-generals`, `issue-35`,
`issue-39`, `feat/011-embedding-api-keys`, `issue-38`, `issue-41`, and
`issue-33-messaging-support`.

These names identify work awaiting disposition, not branches approved for
integration. Once their documentation PRs are closed and requirements are
preserved on the issues, delete the documentation heads and create new branches
from current `main`.

Other upstream branches require these dispositions:

| Branch/group | Live relationship to `origin/main` | Plan |
| --- | --- | --- |
| `web` | 47 commits ahead and 216 behind | Retain as the documented generated GitHub Pages deployment branch. Do not merge it into `main`. Verify that only the deployment workflow writes it. |
| `issue-29-doc-filing-script` | One commit appears unique because PR #42 used a merge commit | Verify patch equivalence to merged PR #42, then delete. |
| `issue-38-api-keys` | Two commits ahead, ten behind; no PR | Read its `AGENTS.md` and plan-status changes only to capture any missing requirement on issue #38. Do not integrate those files; then delete the superseded branch. |
| `futuresquish`, `debugging`, `economy`, `npaserver`, `research` | Fully behind; zero commits ahead | Delete after one final ancestry check. |
| `futuretime`, `patch_history` | Ancient divergent histories with 1,412 and 1,110 commits reported ahead | Do not merge wholesale. Audit their merge bases and unique patches; extract any still-relevant behavior into current issue branches. Create archival tags at the current tips, then delete the branches. |

The `joeman` fork has ten branches. Its `main` is 82 commits behind with no
unique commits. `autoruler-improvements` has one unique 2025 commit and is 84
commits behind; it extracts auto-ruler code but retains the range-plus-five
limit implicated by issue #24. Use it only as review input for issues #22/#24,
not as a direct merge. The remaining fork branches are old copies of upstream
deployment, feature, or divergent-history branches. After upstream work is
resolved, ask the fork owner to delete or archive them; if that is outside this
repository's authority, remove the local `joeman` remote and record the fork as
an external archival dependency rather than pretending it is cleanable here.

### Local branches

Local branches fall into three groups:

- Ancestrally merged and safe to delete after syncing `main`: `autoruler`,
  `buttons`, `debugging`, `diffs`, `economy`, `futuresquish`, `npaserver`,
  `old-storage-exp`, `research`, and `trading`.
- Associated with already merged PRs but not ancestors because of merge/squash
  topology: `codex/e2e-territory-scanning-hud`, `copilot/fix-20`,
  `docs/003-auto-ruler`, `docs/004-star-and-fleet-reports`,
  `docs/documentation-guide`, and `mapnames`. Verify with `git cherry` and the
  merged PR file lists, then delete.
- Old or explicitly experimental work needing an archive/extraction audit:
  `api-comments`, `debughack`, `econhack`, `explore`, `extract-npa`,
  `failed-times`, `futuretime`, `g-refactor`, `g-refactor-ii`, `inbox-hack`,
  `old-main`, `patch_history`, `patches`, `pbs`, `storage-experiment`, and
  `web`. Never merge these wholesale merely to make the branch list shorter.

## Execution plan

### Phase 1: preserve the dirty work and establish an authoritative base

1. Run a credential/secret scan over all modified and untracked files before
   recording them anywhere. Pay particular attention to Apple API keys,
   certificates, provisioning profiles, API keys embedded in test data, and
   signing exports.
2. Create a local-only safety branch from the present `c8a55690` checkout and
   make a clearly labelled snapshot commit containing the current worktree.
   Do not push that snapshot until the secret scan passes.
3. Create a fresh worktree from live `origin/main` (`1a924995` at audit time).
   This becomes the sole baseline for remediation. Use it for integration; do
   not perform conflict resolution in the dirty checkout and do not merge a
   topic branch to establish a newer baseline.
4. Fast-forward local `main` to live `origin/main`, then fetch with pruning and
   repeat the issue, PR, and branch inventory. Stop if remote state changed in
   a way that invalidates this plan.
5. Commit this reviewed remediation plan separately so it does not become part
   of an iOS, source, or documentation feature diff.

### Phase 2: land the public-beta iOS app on main

This is the first integration phase. Do not wait for issue or documentation
cleanup. Work from a fresh branch based on the synchronized live `origin/main`,
using the local safety snapshot only as a source of candidate iOS files.

1. Record the currently distributed TestFlight version, build number, upload
   date, external group, public link, and beta-review state from App Store
   Connect. Update `IOS_TESTFLIGHT_PLAN.md` from a prospective plan into an
   accurate as-built/release-handoff record.
2. Locate the Xcode archive used for the public beta, if it still exists. Hash
   its embedded `intel.js`, `intel.css`, background bundle, icons, Info.plist,
   and executable metadata. Compare those hashes with the dirty worktree and
   with a clean `bun run build` from current `main`.
3. Classify provenance before committing:
   - if the archive matches the candidate iOS files and a clean build, record
     that evidence and preserve the existing public beta version/build;
   - if it contains uncommitted source behavior or cannot be reproduced, label
     that build as a legacy beta with incomplete source provenance. Do not merge
     untested `src/intel.ts` changes merely to imitate it. Prepare the next
     build number from authoritative `main` and replace the public beta with
     the reproducible build after merge.
4. Create a focused iOS PR containing only the reviewed release-support set:
   - `.gitignore` credential/release-product exclusions;
   - Xcode project identity and signing-team metadata;
   - asset-catalog icons and removal of obsolete loose-icon references;
   - `ITSAppUsesNonExemptEncryption` declaration;
   - shared Release archive scheme;
   - TestFlight export options;
   - `ios/scripts/stage-web-assets.sh`;
   - current iOS release/handoff documentation;
   - the deterministically staged `ios/NPAiOS/Resources/Dist` payload.
5. Explicitly exclude `src/intel.ts` and `UPDATES_REQUIRED.md` from the iOS PR.
   They are separate source/audit work. Generate the embedded payload from
   clean current `main`, not from the dirty snapshot's source file.
6. Make `ios/scripts/stage-web-assets.sh` invoke `bun run build`, fail on
   missing/empty assets, and prove byte-for-byte parity between `dist` and
   `ios/NPAiOS/Resources/Dist`. Update all iOS instructions to use Bun.
7. Resolve the current 21,000-line JavaScript reduction by regeneration. Accept
   it only if two clean production builds produce identical output and the iOS
   app loads that output successfully. Clear the existing trailing-whitespace
   failure as part of generation, not by hand-editing the bundle.
8. Validate the PR with a secret scan, `git diff --check`, Bun build/tests,
   asset parity, an unsigned Release device build, archive validation, and a
   real-device smoke test covering launch, login persistence, and visible NPA
   injection.
9. Merge the iOS PR before starting broad issue/documentation work. From a clean
   checkout of the merge commit, rerun staging and require no diff, archive the
   app, and either confirm it is the exact current public beta or upload the
   incremented reproducible replacement build to the public-beta group.
10. After TestFlight processing/review, update the release record with the exact
    main commit and build number and create an iOS release tag pointing to that
    commit. Mark only the iOS paths as recovered from the safety snapshot; keep
    the snapshot until its remaining source and audit work is dispositioned.

### Phase 3: standardize the repository on Bun and add enforcement

Several documentation branches attempt ad hoc Node/`tsx` migrations. None of
those changes should be salvaged. Make the Bun policy explicit in one focused
foundation PR created from current `main`:

1. Use Bun as package manager, TypeScript runtime, and script launcher. The
   canonical entry points are `bun install --frozen-lockfile` and the named
   `bun run` package scripts; direct `npm`, `npx`, `node`, and `tsx`
   substitutions should remain only where a demonstrated third-party
   compatibility constraint requires them.
2. Make `bun.lockb` (or a deliberately upgraded Bun text lockfile) the only
   dependency lockfile. Regenerate it from `package.json`, verify a frozen
   install, and remove `package-lock.json` rather than carrying two competing
   dependency graphs.
3. Align `package.json`, `bin/version.ts`, `DEVELOPMENT.md`, `flake.nix`, test
   setup, utility scripts, and documentation with the Bun-only policy. Preserve
   behavior from current `main`; do not copy equivalent edits from old docs
   branches.
4. Run build, Biome, Vitest, the test server, Playwright, and documentation
   generation through `bun run` scripts. The underlying test framework remains
   Vitest/Playwright; Bun is the supported orchestration/runtime layer.
5. Add a required CI workflow that performs a frozen Bun install and runs the
   canonical build, lint, unit-test, Playwright, and documentation checks. The
   repository currently has book preview/deploy workflows but no required core
   validation workflow.
6. Protect `main`; it is currently unprotected. Require PRs, successful core
   CI, documentation preview where applicable, and resolved conversations.
7. Merge this foundation before creating any replacement documentation branch,
   so every new scenario starts from the same Bun-based main.

### Phase 4: turn the remaining worktree into focused reviewed changes

Recover files from the safety snapshot into fresh branches by path and intent,
not by merging the snapshot branch. Current `main` wins every conflict by
default; replay a local change only after its purpose and correctness have been
established independently.

#### Upstream/game compatibility and report behavior

1. Reconcile `UPDATES_REQUIRED.md` with the actual `src/intel.ts` diff. The
   current source diff changes alias references and historical-report range;
   it does not visibly implement all three requirements described in the audit
   document (`select_and_show_new_fleet`, `Player.realAlias`, and
   `config.apiAccess`). Do not claim the audit is implemented until code and
   tests line up.
2. Split unrelated source behavior into separate commits or PRs:
   alias/reference handling, historical report range, fleet creation event,
   real-alias preservation, and API-access gating.
3. Add unit or Playwright coverage for each behavior, including NP4 aliases,
   disabled API access, auto-waypoint fleet creation, and filtered historical
   reports.
4. Merge only after build, lint, unit tests, and targeted Playwright tests pass.

### Phase 5: resolve product issues

Work from oldest/highest-dependency defects toward documentation. Use one
issue-linked PR per independently testable behavior.

| Issue | Resolution work and closure evidence |
| --- | --- |
| [#13](https://github.com/anicolao/npa/issues/13) `colorMap` initialization | The issue cites commit `5a62ee45` as the intended fix but was never closed. Confirm that commit is in current `main`, add or identify a regression test exercising initialization order, test on supported current Chrome/NP4, ask the reporter to verify if practical, and close as fixed if no longer reproducible. Otherwise repair before closing. |
| [#14](https://github.com/anicolao/npa/issues/14) Chrome/Firebase errors | Reproduce with a clean profile on a supported current Chrome and distinguish expected Firebase permission failures from NPA cascades. Make rejected requests handled and non-cascading, add logging/error-path tests, document any required backend permissions, and close with console/test evidence. If the obsolete Triton build is the only affected target, state the support boundary and close as unsupported with migration guidance. |
| [#16](https://github.com/anicolao/npa/issues/16) formal-alliance API merge | Add fixture coverage where formal alliance visibility and an ally API scan overlap, including multi-stop fleet routes. Define field-level merge precedence, fix the overlay without losing routes or visible data, run Chrome-extension E2E coverage, and close with the regression test. This should precede final alliance documentation (#41). |
| [#23](https://github.com/anicolao/npa/issues/23) time-machine state bugs | Encode every reported sequence: future then micro-back, historical then reset then future/back, historical then forward to present, and production-timer restoration. Make stepping symmetric across `trueTick`; stepping back one tick from simulated future must not snap directly to present. Restore live `now`, tick fragment, and production timer exactly when returning. Close only after deterministic unit/E2E coverage. This blocks #39 and #40. |
| [#22](https://github.com/anicolao/npa/issues/22) confusing arrow origin | Resolve the design with the reporter's suggested dim/dotted full route plus the scaled travel segment, or document an agreed alternative. Correct or remove the visibility arc if its position is misleading. Add gated/ungated and turn-based screenshot assertions, then close with before/after images. |
| [#24](https://github.com/anicolao/npa/issues/24) range indicator cap | Replace the five-level search cap with an exact bounded calculation, or display an honest `> +5` result if exact calculation is intentionally avoided. Test large range gaps, gates, and combat handicap restoration. Review `joeman/autoruler-improvements` for reusable structure, but do not merge that stale extraction directly. |
| [#12](https://github.com/anicolao/npa/issues/12) carrier-route sharing | Confirm the desired output and whether copying should include carrier name, destination links, ETA/timebase, actions, arguments, loops, and delays. Implement the accepted report/copy action with formatting tests and a Playwright scenario, or close as declined with product rationale. |

After each merge, comment on the issue with the fixing commit/PR, exact tests run,
and any user-visible behavior change, then close it. Do not wait until the end to
bulk-close issues without traceability.

### Phase 6: close the old documentation PRs and redo the work from main

First copy only actionable requirements and human review feedback from PRs
#43, #44, #45, #46, #48, #49, #50, #52, and #56 to their corresponding
issues. Then close all nine PRs as superseded and delete their remote heads.
Do not cherry-pick their tests, prose, screenshots, build changes, or source
changes.

For each open documentation issue, reread `E2E_GUIDE.md`,
`DOCUMENTATION_GUIDE.md`, and `DOCUMENTATION_PLAN.md` from the then-current
`main`, create a new single-purpose branch from `main`, and author the scenario
again. A replacement PR may change only its numbered scenario and the matching
plan row. If it exposes a product defect, stop the documentation PR, reproduce
and fix the defect separately, update `main`, and restart or rebase the scenario
from that corrected main.

Every replacement must assert unique NPA output rather than generic page text.
Generated README, DOCS, and screenshots must come from the passing scenario in
the same commit, and all commands must use the canonical Bun scripts.

Recommended merge order:

1. #30 — redo section 005 Empires. Use the review lesson that “Empires” is too
   generic; assert “All Surviving Empires” or another report-specific element
   and visually verify the final screenshot.
2. #31 — redo section 006 Accounting and Trading. Diagnose the old preview
   failure only as background and verify semantic assertions for both reports.
3. #32 — redo section 007 Economists and Generals using the real reports; an
   accounting fallback is not completion.
4. #33 — independently fix the constructor defect if it reproduces on `main`,
   then redo section 008 Messaging from the corrected main.
5. #34 — create section 009 Intel and Screenshot Buttons from current `main`,
   including deterministic screenshot-upload mocking and report insertion.
6. #35 — redo section 010 Embedded Content.
7. #36 — redo section 011 Embedding API Keys, including redaction so real
   API credentials never enter screenshots or generated docs.
8. #38 — redo section 013 API Keys after the Bun foundation and API-access
   gating work. Reconcile and delete `issue-38-api-keys` without importing its
   orchestration handoff files.
9. #39 — redo section 014 Time Machine only after #23 is fixed. Use no test
   workarounds; demonstrate real forward, backward, cycle, and return-to-live
   behavior in the documented timebase.
10. #40 — create section 015 Historical Time-Based Reports after #23/#39.
    Cover Ownership, Formal Alliances, Trade Activity, Combat Activity, and
    Activity at controlled historical ticks.
11. #41 — redo section 016 Alliance Coordination after #16. Cover allied API
    keys, merging, the research report, and formal alliances, but regenerate
    every test and artifact from current behavior.

After a replacement documentation PR merges, verify that its issue auto-closes;
otherwise add the evidence comment and close it manually.

### Phase 7: close or supersede the stale refactor PR

PR [#19](https://github.com/anicolao/npa/pull/19) is not part of an open issue,
has no checks, rewrites the lockfile substantially, and conflicts with current
`intel.ts`.

1. Compare each extracted module with current code to see whether later work
   already supplied the same separation.
2. If modularization remains desirable, create small current branches with
   behavior-preserving tests, one extraction at a time. Do not make completion
   of this repository cleanup depend on a broad refactor.
3. Close #19 with links to any replacements, or with a clear obsolete/superseded
   explanation.

### Phase 8: branch and remote cleanup

Perform deletion only after the issue/PR work above is merged or explicitly
closed.

1. Delete merged PR heads from `origin`.
2. Delete the five fully-behind feature branches and the patch-equivalent
   `issue-29-doc-filing-script` branch.
3. Delete `issue-38-api-keys` after its useful content is reconciled.
4. For `futuretime` and `patch_history`, record tip SHA, merge base, unique
   commit inventory, and extraction decision in the closing cleanup commit or
   issue comment. Tag their tips as `archive/futuretime-2023` and
   `archive/patch-history-2023` (or similarly explicit names), push the tags,
   then delete the branches.
5. Retain `web` only as a generated deployment branch. Verify Pages settings
   and deployment workflow, and document that it is intentionally not merged.
6. Ask the `JoemanCXL/npa` owner to archive/delete resolved fork branches. If
   that cannot be done, remove the local `joeman` remote after the one unique
   auto-ruler commit is dispositioned.
7. Delete local branches in the two known-merged groups after `git cherry` and
   PR verification.
8. For every remaining local experimental branch, create an archival tag and
   delete it if it contains no intended current work. If it does contain useful
   work, extract only that patch into an issue-linked current branch first.
9. Remove obsolete worktrees, expire no reflogs during this remediation, fetch
   with `--prune`, and confirm `git branch -a` contains only intentional refs.

### Phase 9: final integration and closure audit

1. From a new clone of `origin/main`, run `bun install --frozen-lockfile`, then
   use `bun run` for:
   - the production build;
   - formatter/linter check without auto-writing;
   - unit test suite with coverage;
   - complete Playwright suite;
   - documentation book build and link/image validation;
   - iOS web-asset staging parity check;
   - unsigned iOS Release device build and archive validation where Xcode is
     available.
2. Confirm generated files do not change after running the documented build
   twice. Any second-run diff is a reproducibility defect, not harmless noise.
3. Confirm `git diff --check` is clean and no credential-like files are tracked.
4. Query GitHub again and require zero open issues and zero open PRs. Every
   closed item must link to its merge, verification, duplicate, or decline
   rationale.
5. Confirm live `origin/main`, local `main`, and the checked-out commit match;
   `git status --porcelain` must produce no output.
6. Confirm the branch list contains only `main`, the intentional `web`
   deployment branch, and any explicitly approved archive tags—not abandoned
   feature branches.
7. Record the final audit result in the last remediation PR and create a release
   tag only if the resulting main commit is the exact code intended for the
   next extension/iOS release.

## Remaining review decisions before execution

Main authority, Bun tooling, committed deterministic iOS web assets, immediate
iOS priority, and replacement of the old documentation work are settled. The
remaining policy choices are:

1. Confirm authority to delete branches on `origin` and whether cleanup of the
   `JoemanCXL/npa` fork should be coordinated with its owner or handled by
   removing the local remote.
2. Confirm that ancient divergent branch tips should be preserved as archive
   tags rather than kept as branches.
3. Decide whether feature request #12 is accepted for implementation or should
   be closed as declined; all defect and documentation issues otherwise have a
   concrete completion path above.
