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

## Green and Grey Scan ETAs for multiple fleets

![Green and Grey Scan ETAs for multiple fleets](./screenshots/005-scan-eta-green-and-grey-fleets.png)

### Verifications
- [x] Selecting Alshat shows multiple scan ETAs: Green for unscanned fleets and Grey for already scanned fleets
- [x] The scan HUD example includes one green indicator and one grey indicator in the screenshot frame

## Measure scan ETA with a fake fleet route

![Measure scan ETA with a fake fleet route](./screenshots/006-measure-scan-eta-with-fake-fleet.png)

### Verifications
- [x] The scan HUD calculation predicts the tick when the fake fleet enters Laser Fort 11's scanning range

