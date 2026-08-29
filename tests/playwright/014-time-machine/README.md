# Time Machine Validation

Verify that the time machine can project the game state forward into the future and snap back to the present.

Documentation target: `Time machine`

Companion user documentation: [DOCS.md](./DOCS.md)

## View the current game state at the present tick

![View the current game state at the present tick](./screenshots/000-present-view.png)

### Verifications
- [x] The map is centered on the target star and shows the current tick

## Project the game state forward by one tick

![Project the game state forward by one tick](./screenshots/001-future-one-tick.png)

### Verifications
- [x] Pressing ctrl+. advances the time machine to the next tick

## Project the game state forward by a full production cycle

![Project the game state forward by a full production cycle](./screenshots/002-future-one-cycle.png)

### Verifications
- [x] Pressing ctrl+/ advances the time machine by one full production cycle (20 ticks in this game)

## Return to the present game state

![Return to the present game state](./screenshots/003-back-to-present.png)

### Verifications
- [x] Pressing ctrl+, from a future state snaps the time machine back to the present
