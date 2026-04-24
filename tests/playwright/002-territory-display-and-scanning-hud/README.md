# Territory Display And Scanning HUD Validation

Verify that the territory overlay can be framed, restyled through all four modes, recolored to white, and combined with both existing and fake fleets to measure scan ETA.

Documentation target: `Territory display and scanning HUD`

Companion user documentation: [DOCS.md](./DOCS.md)

## Visualize empire reach with territory overlays

![Visualize empire reach with territory overlays](./screenshots/000-show-selected-empire-territory.png)

### Verifications
- [x] The fixture starts with Mega Segin selected for Osric
- [x] The screenshot frame keeps Mega Segin near the center with nearby Osric territory visible

## Cycle to territory rendering style: Bright Haze

![Cycle to territory rendering style: Bright Haze](./screenshots/001-cycle-territory-display-style-2.png)

### Verifications
- [x] The territory style is now 2

## Cycle to territory rendering style: Black Background with Outlines

![Cycle to territory rendering style: Black Background with Outlines](./screenshots/002-cycle-territory-display-style-3.png)

### Verifications
- [x] The territory style is now 3

## Cycle to territory rendering style: Outlines Only

![Cycle to territory rendering style: Outlines Only](./screenshots/003-cycle-territory-display-style-4.png)

### Verifications
- [x] The territory style is now 4

## Toggle political map borders and empire names

![Toggle political map borders and empire names](./screenshots/004-toggle-political-borders.png)

### Verifications
- [x] The ctrl+0 hotkey toggles the visibility of political borders and empire names

## Recolor your empire white on the map

![Recolor your empire white on the map](./screenshots/005-recolor-my-territory-white.png)

### Verifications
- [x] The w hotkey changes the current player's map color to white

## Green and Grey Scan ETAs for multiple fleets

![Green and Grey Scan ETAs for multiple fleets](./screenshots/006-scan-eta-green-and-grey-fleets.png)

### Verifications
- [x] Selecting Alshat shows multiple scan ETAs: Green for unscanned fleets and Grey for already scanned fleets
- [x] The scan HUD example includes one green indicator and one grey indicator in the screenshot frame

## Measure scan ETA with a fake fleet route

![Measure scan ETA with a fake fleet route](./screenshots/007-measure-scan-eta-with-fake-fleet.png)

### Verifications
- [x] The scan HUD calculation predicts the tick when the fake fleet enters Laser Fort 11's scanning range
