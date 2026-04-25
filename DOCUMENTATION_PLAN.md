# NPA Documentation Plan

This plan defines the first-pass structure of the user documentation book that will be generated and verified through E2E scenarios.

Each approved scenario in this plan is expected to eventually produce:

- a scenario `README.md` for validation
- a scenario `DOCS.md` that becomes part of the end-user documentation book

Current status: planning only. No chapter in this plan has been approved for authoring yet.

## Proposed Chapter Order

| ID | Section | Coverage | Status |
| --- | --- | --- | --- |
| 001 | How to read the battle HUD | Timebases, control of enemy fleets, combat handicap | Planned |
| 002 | Territory display and scanning HUD | Territory display styles, recolor to white, fake fleets for scan ETA measurement | Planned |
| 003 | Interpreting and controlling the auto-ruler | Reading the ruler, changing its behavior, understanding its outputs | Planned |
| 004 | Star and Fleet reports | Fleets short, fleets long, combats, filtered fleets, home planets | Planned |
| 005 | Empires | Recolouring players, defining enemy alliances | Planned |
| 006 | Accounting and Trading | Economy-oriented views and trade interpretation | Planned |
| 007 | Economists and Generals | Reading and using those summary reports | Planned |
| 008 | Messaging support | Message composition workflow and NPA messaging helpers | Planned |
| 009 | Intel and Screenshot buttons | Report insertion, screenshot capture, and related UI | Planned |
| 010 | Embedded image and YouTube links | Rich content support inside messages or reports | Planned |
| 011 | Embedding API keys | How embedded keys are used and where they appear | Planned |
| 012 | Autocomplete | Available autocomplete behavior and how to use it correctly | Complete |
| 013 | API keys | Creating, entering, and validating API keys in NPA | Planned |
| 014 | Time machine | Navigating historical views and understanding timeline controls | Complete |
| 015 | Historical time-based reports | Ownership, Formal alliances, Trade Activity, Combat Activity, Activity | Planned |
| 016 | Alliance coordination | Research info, Map API key merging | Planned |

## Expected Scenario Shape

Each chapter should eventually map to one numbered Playwright scenario directory:

```text
tests/playwright/001-battle-hud/
tests/playwright/002-territory-display-and-scanning-hud/
...
```

Inside each scenario directory we expect:

- one `.spec.ts` file
- one generated `README.md`
- one generated `DOCS.md`
- one `screenshots/` directory

## Writing Constraints For Future Chapters

When chapter authoring begins, each scenario should:

1. Verify real NPA behavior in the local Playwright fixture.
2. Capture screenshots only after the asserted state is stable.
3. Write `README.md` for validation and `DOCS.md` for end-user documentation from the same step data.
4. Stay scoped to one documentation chapter from the table above.

## Deferred Decisions

These points are intentionally left open until after plan review:

- exact chapter wording in the final book
- whether some planned chapters should be merged or split
- how the chapter-level `DOCS.md` files will later be assembled into one published book
- which chapter should be authored first
