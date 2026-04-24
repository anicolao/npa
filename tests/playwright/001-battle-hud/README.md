# Battle HUD Validation

Verify that the battle HUD workflow can select a frontline star, route a fake enemy fleet, cycle ETA timebases, and render combat handicap text.

Documentation target: `How to read the battle HUD`

Companion user documentation: [DOCS.md](./DOCS.md)

## Create a fake enemy fleet from the selected frontline star

![Create a fake enemy fleet from the selected frontline star](./screenshots/000-route-enemy-fleet-relative-eta.png)

### Verifications
- [x] The chosen frontline fixture star includes allied defenders, making it a battle-relevant target
- [x] The x hotkey creates and selects a synthetic enemy fleet for planning
- [x] The route editor shows a relative ETA for the fake enemy fleet
- [x] The screenshot frame keeps Hot Sham near the center with the selected fleet, route, and Red Chertan waypoint visible

## Show the battle ETA as clock time

![Show the battle ETA as clock time](./screenshots/001-cycle-to-clock-time.png)

### Verifications
- [x] The % hotkey changes the route ETA to an absolute clock-time display
- [x] The route editor shows the clock-time ETA
- [x] The clock-time screenshot still frames Hot Sham, the selected fake fleet, and the Red Chertan route

## Show the battle ETA as relative ticks

![Show the battle ETA as relative ticks](./screenshots/002-cycle-to-relative-ticks.png)

### Verifications
- [x] The next % press changes the route ETA to relative ticks
- [x] The route editor updates to the relative-ticks view
- [x] The relative-ticks screenshot still frames Hot Sham, the selected fake fleet, and the Red Chertan route

## Show the same battle ETA as absolute tick numbers

![Show the same battle ETA as absolute tick numbers](./screenshots/003-cycle-to-absolute-tick-numbers.png)

### Verifications
- [x] A further % press changes the ETA sample to an absolute tick number
- [x] The route editor reflects absolute tick-number mode
- [x] The absolute-tick screenshot keeps Hot Sham centered and the selected fleet route visible

## Model a worse-case fight by giving the enemy extra weapons

![Model a worse-case fight by giving the enemy extra weapons](./screenshots/004-apply-combat-handicap.png)

### Verifications
- [x] The . hotkey changes the rendered battle overlay in the HUD footer
- [x] The fake enemy fleet and battle route remain selected after applying the handicap
- [x] The handicap screenshot keeps the battle HUD footer visible while Hot Sham and its selected fleet route remain in frame

