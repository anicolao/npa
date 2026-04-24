# Territory Display And Scanning HUD Validation

Verify that the territory overlay can be framed, restyled, recolored to white, and combined with a fake fleet route to measure when the fleet enters enemy scanning range.

Documentation target: `Territory display and scanning HUD`

Companion user documentation: [DOCS.md](./DOCS.md)

## Show the selected empire's territory and scanning reach

![Show the selected empire's territory and scanning reach](./screenshots/000-show-selected-empire-territory.png)

### Verifications
- [x] The fixture starts with Mega Segin selected for Osric
- [x] The screenshot frame keeps Mega Segin near the center with nearby Osric territory visible

## Cycle the territory display style

![Cycle the territory display style](./screenshots/001-cycle-territory-display-style.png)

### Verifications
- [x] The ctrl+9 hotkey changes the rendered territory style
- [x] The selected star remains Mega Segin after cycling the territory style
- [x] The territory-style screenshot keeps Mega Segin and its surrounding territory in frame

## Recolor your empire white on the map

![Recolor your empire white on the map](./screenshots/002-recolor-my-territory-white.png)

### Verifications
- [x] The w hotkey changes the current player's map color to white
- [x] The white recolor changes the rendered map while keeping the same selected star
- [x] The white-territory screenshot keeps Mega Segin centered with the recolored territory visible

## Measure scan ETA with a fake fleet route

![Measure scan ETA with a fake fleet route](./screenshots/003-measure-scan-eta-with-fake-fleet.png)

### Verifications
- [x] The fake fleet route starts from Mega Segin and targets Laser Fort 11
- [x] The scan HUD calculation predicts the tick when the fake fleet enters Laser Fort 11's scanning range
- [x] The scan ETA screenshot keeps Mega Segin, Laser Fort 11, the selected fake fleet, and route visible

