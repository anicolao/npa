# Territory Display And Scanning HUD Validation

Verify that the territory overlay can be framed, restyled through all four modes, recolored to white, and combined with both existing and fake fleets to measure scan ETA.

Documentation target: `Territory display and scanning HUD`

Companion user documentation: [DOCS.md](./DOCS.md)

## Show the selected empire's territory and scanning reach

![Show the selected empire's territory and scanning reach](./screenshots/000-show-selected-empire-territory.png)

### Verifications
- [x] The fixture starts with Mega Segin selected for Osric
- [x] The screenshot frame keeps Mega Segin near the center with nearby Osric territory visible

## Cycle to territory display style 2

![Cycle to territory display style 2](./screenshots/001-cycle-territory-display-style-2.png)

### Verifications
- [x] The territory style is now 2

## Cycle to territory display style 3

![Cycle to territory display style 3](./screenshots/002-cycle-territory-display-style-3.png)

### Verifications
- [x] The territory style is now 3

## Cycle to territory display style 4

![Cycle to territory display style 4](./screenshots/003-cycle-territory-display-style-4.png)

### Verifications
- [x] The territory style is now 4

## Recolor your empire white on the map

![Recolor your empire white on the map](./screenshots/004-recolor-my-territory-white.png)

### Verifications
- [x] The w hotkey changes the current player's map color to white

## Green Scan ETA for a fleet not currently in scan

![Green Scan ETA for a fleet not currently in scan](./screenshots/005-scan-eta-green-unscanned-fleet.png)

### Verifications
- [x] Selecting Fast Jih shows a green scan ETA for an approaching allied fleet (680) that the enemy cannot see yet

## Grey Scan ETA for a fleet already scanned by another star

![Grey Scan ETA for a fleet already scanned by another star](./screenshots/006-scan-eta-grey-already-scanned-fleet.png)

### Verifications
- [x] Selecting Fast Jih also shows scan ETA for other approaching fleets (684)

## Measure scan ETA with a fake fleet route

![Measure scan ETA with a fake fleet route](./screenshots/007-measure-scan-eta-with-fake-fleet.png)

### Verifications
- [x] The scan HUD calculation predicts the tick when the fake fleet enters Laser Fort 11's scanning range

