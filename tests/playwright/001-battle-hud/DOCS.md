# How To Read The Battle HUD

The battle HUD is not one isolated panel. It is a set of map overlays, ETA labels, and control shortcuts that help you inspect a frontline star, plan enemy movement, and model worse-case combat assumptions.

Book section: `How to read the battle HUD`

## Create a fake enemy fleet from the selected frontline star

Start by selecting the hostile frontline star, then press `x` to make a fake enemy fleet. NPA temporarily switches control context to that enemy empire so you can plan the route they could fly without changing the real game state.

![Create a fake enemy fleet from the selected frontline star](./screenshots/000-route-enemy-fleet-relative-eta.png)

### How to use it
- Select the enemy star you want to inspect.
- Press `x` to create a fake enemy fleet from that star.
- Add a waypoint to see where that fleet could go and how long it would take.

### What to expect
- A waypoint editor appears for a newly created synthetic fleet.
- The lower-right map overlay shows that you are temporarily controlling the selected enemy empire.
- The waypoint editor displays an ETA using the current timebase.

### Caveats
- These orders are only for planning. They do not send any real orders to the server.

## Cycle the battle ETA through clock time and relative ticks

Press `%` to cycle how the battle HUD explains travel time. NPA moves from wall-clock planning to tick-count planning without changing the route itself.

![Cycle the battle ETA through clock time and relative ticks](./screenshots/001-cycle-to-clock-and-relative-ticks.png)

### How to use it
- With the battle route visible, press `%` once for clock time.
- Press `%` again to switch to relative tick counts.

### What to expect
- Clock mode shows a real-world timestamp such as `Sun @ 1:40 AM`.
- Relative tick mode changes the same ETA into a tick count such as `18 ticks`.
- The waypoint panel and production readout stay aligned with the chosen timebase.

## Show the same battle ETA as absolute tick numbers

Press `%` again when you want a precise game tick instead of a relative duration. This is the most explicit way to coordinate combat windows with allies.

![Show the same battle ETA as absolute tick numbers](./screenshots/002-cycle-to-absolute-tick-numbers.png)

### How to use it
- After reaching relative tick mode, press `%` one more time.
- Read the ETA and production readouts as explicit tick numbers.

### What to expect
- The same route now shows an exact destination tick such as `Tick #543`.
- You can compare the fleet ETA directly against combat or production timing discussed in reports and chat.

## Model a worse-case fight by giving the enemy extra weapons

Use `.` to give the enemy one more weapons level in the battle HUD calculations. NPA marks the footer with `Enemy WS+1` so you can see that the current numbers are a pessimistic model rather than the default estimate.

![Model a worse-case fight by giving the enemy extra weapons](./screenshots/003-apply-combat-handicap.png)

### How to use it
- Keep the battle route selected.
- Press `.` to increase the enemy weapons assumption by one level.

### What to expect
- The footer overlay changes to show the enemy handicap, for example `Enemy WS+1`.
- The battle HUD continues to describe the same route, but now under a harsher combat assumption.

### Caveats
- This is a planning aid. It changes NPA's local calculation, not the real weapons tech on the server.

