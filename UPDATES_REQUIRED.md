# NP4 upstream compatibility audit

Audit source: the local `../np4/sync` worktree based on `b4fa2df`, including
its uncommitted game-client changes reviewed on 2026-08-26.

## Disposition

| Upstream change | NPA disposition |
| --- | --- |
| `select_and_show_new_fleet` | Implemented. Auto-waypoints sends the selected star with the new event shape. |
| `Player.realAlias` | Implemented in the player type. Time travel now changes only the display alias and preserves both upstream identity fields. |
| `config.apiAccess` | Implemented. Missing configuration remains enabled; an explicit `0` suppresses API hotkeys/autocomplete, registration, refresh, and network-backed key workflows. |
| ruler point removal | No NPA change required; NPA reads ruler state and lets the game client own removal. |
| graphics/cloud changes | No NPA change required; the overlays do not patch cloud drawing. |
| gift inbox events | No NPA change required; message caching and indexing are template-agnostic. |
| pre-game star controls | No NPA change required; NPA does not patch the star inspector controls. |
| template/widget additions | No NPA change required; NPA extends the live template map without replacing these paths. |

## Recovered worktree changes

The saved `src/intel.ts` changed player references and the ownership-report
history range. Those behaviors were independently reimplemented against
current `main`:

- report references accept the live display alias while retaining raw and real
  alias hyperlink keys;
- a filtered ownership report begins at the earliest available personal scan,
  while an unfiltered report remains limited to one production cycle.

The saved source file was not merged or copied wholesale. Each compatibility
behavior has focused unit coverage under `tests/upstream.spec.ts` or
`tests/timetravel-alias.spec.ts`.
