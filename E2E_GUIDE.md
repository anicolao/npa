# E2E Testing Guide: Neptune's Pride Agent

This document is the guide for writing end-to-end tests for Neptune's Pride Agent.
In this repository, E2E scenarios have two jobs:

1. Validate that the extension feature works against the local Neptune's Pride fixture.
2. Generate committed artifacts that explain the feature to end users.

Every documented scenario is expected to produce:

- `README.md`: the validation artifact for reviewers and maintainers
- `DOCS.md`: the user-facing draft section for the NPA documentation book
- `screenshots/`: the visual record shared by both documents

## 1. Philosophy: Validation And Documentation In One Flow

The extension changes a live, visual UI. The safest way to document it is to verify it in the same test run that captures the screenshots and writes the prose artifacts.

That means:

- each important user-visible state should be captured by a single atomic test step
- every step should verify the intended behavior before its screenshot is saved
- the generated docs should describe what a user can actually do in the verified UI

If a feature cannot yet be described clearly for end users, the test should not pretend otherwise. Tighten the scenario first.

## 2. Hard Requirements

1. Do not use `page.waitForTimeout()` or arbitrary sleeps in scenario tests.
   The shared fixture layer may contain narrowly-scoped bootstrap waits for extension loading. Scenario code should rely on locators, `expect(...)`, and deterministic `waitForFunction(...)`.
2. Prefer resilient locators.
   Use user-facing text, roles, labels, and stable UI hooks instead of brittle CSS selectors.
3. Keep each step atomic.
   One `step(...)` call should describe one user-visible state, one screenshot, and one set of validations.
4. Commit generated artifacts.
   If a scenario changes behavior, regenerate and commit its `README.md`, `DOCS.md`, and screenshots with the code change.
5. Write DOCS in end-user language.
   `DOCS.md` is not a developer note. It should explain what users see, how to use the feature, and what result to expect.

## 3. Repository-Specific Test Model

The Playwright harness in this repository already does the heavy lifting:

- builds the extension bundle before test startup
- refreshes live Neptune's Pride client assets before each Playwright run
- starts a local test server on `http://localhost:8080`
- launches Chromium with the unpacked extension loaded
- boots a real fixture page and waits for NPA hooks to attach

Documented scenarios should build on that harness rather than reimplementing browser startup themselves.

Shared files today:

- `tests/playwright/fixtures.ts`
- `tests/playwright/helpers.ts`

New documentation-oriented scenarios should additionally use:

- `tests/playwright/support/test-step-helper.ts`

## 4. Scenario Directory Convention

For documentation-generating scenarios, use one numbered directory per feature:

```text
tests/playwright/
├── support/
│   └── test-step-helper.ts
├── 001-battle-hud/
│   ├── 001-battle-hud.spec.ts
│   ├── README.md
│   ├── DOCS.md
│   └── screenshots/
│       ├── 000-battle-hud-visible.png
│       └── 001-timebase-switcher.png
```

The current flat tests can remain while the framework is being established. New feature documentation should use the scenario-directory convention above.

## 5. Unified Step Pattern

Use `TestStepHelper` to keep validation, screenshot capture, and doc generation in sync.
Do not hand-manage screenshot numbering or write README/DOCS by hand for scenario tests.

Basic pattern:

```ts
import { expect, test } from "../fixtures";
import { waitForAgentHooks } from "../helpers";
import { TestStepHelper } from "../support/test-step-helper";

test("documents the battle HUD", async ({ appPage }, testInfo) => {
  const helper = new TestStepHelper(appPage, testInfo);

  helper.setMetadata({
    title: "Battle HUD Validation",
    validationGoal: "Verify that the battle HUD appears with the expected controls and numbers.",
    docsTitle: "How To Read The Battle HUD",
    docsSummary:
      "This section explains how the battle HUD presents combat timing, fleet control, and handicap data.",
    bookSection: "How to read the battle HUD",
  });

  await waitForAgentHooks(appPage);

  await helper.step("battle-hud-visible", {
    description: "Battle HUD is visible during a combat-focused state",
    verifications: [
      {
        spec: "The battle HUD is visible",
        check: async () => await expect(appPage.getByText("Battle")).toBeVisible(),
      },
    ],
    documentation: {
      summary: "The battle HUD appears once the relevant combat state is on screen.",
      howToUse: [
        "Open a game state where combat information is available.",
        "Look for the battle HUD elements added by NPA.",
      ],
      expectedResult: [
        "The HUD is visible without needing a page reload.",
        "The combat-related controls and numbers are present in the UI.",
      ],
    },
  });

  helper.generateArtifacts();
});
```

## 6. What The Helper Must Generate

For each scenario:

- `README.md` should capture the validation story
- `DOCS.md` should capture the end-user explanation
- `screenshots/NNN-step-name.png` should be referenced from both docs

`README.md` should answer:

- what was validated
- what visible states were captured
- which assertions passed at each step

`DOCS.md` should answer:

- what the feature is for
- how a user activates or reads it
- what the user should expect to see
- any caveats worth calling out

## 7. Documentation Style Rules

For `DOCS.md` content generated from scenarios:

- write for a player using the extension, not for a maintainer reading source
- prefer concrete, visual language
- explain the meaning of labels, icons, values, and controls
- include warnings only when they matter to correct usage
- avoid implementation details unless they change user behavior

## 8. Review Standard

A scenario is not done when only the test passes.
It is done when:

- the Playwright test passes
- `README.md` is regenerated and accurate
- `DOCS.md` is regenerated and accurate
- screenshots match the validated UI state
- the scenario cleanly fits the documentation plan in `DOCUMENTATION_PLAN.md`
