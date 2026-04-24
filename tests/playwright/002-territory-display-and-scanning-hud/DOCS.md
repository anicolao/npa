# Territory Display And Scanning HUD

The territory and scanning HUD overlays make the map easier to read while planning. They show which empire owns the selected area, allow you to cycle through different territory rendering styles, and provide precise arrival times for fleets entering a star's scanning range.

## Show the selected empire's territory and scanning reach

Selecting a star highlights the territory owned by that empire. This colored shape provides a quick visual summary of an empire's local influence and borders. In the example below, selecting `Mega Segin` reveals the surrounding empire's reach.

![Show the selected empire's territory and scanning reach](./screenshots/000-show-selected-empire-territory.png)

### How to use it
- Select any star on the map.
- Zoom out to see the full extent of the territory overlay.

### What to expect
- The territory of the selected star's owner is shaded on the map.
- Neighboring stars (such as `Mega Segin` in the example) remain visible to help you orient the borders.

## Cycle to territory display style 2

Style 2 offers a different visual balance between territory fill and map clarity. Comparison is easy as the view remains centered on `Mega Segin`.

![Cycle to territory display style 2](./screenshots/001-cycle-territory-display-style-2.png)

### How to use it
- Press **Ctrl+9** to cycle to the next style.

### What to expect
- The visual style of the territory rendering updates immediately.

## Cycle to territory display style 3

Style 3 offers a different visual balance between territory fill and map clarity. Comparison is easy as the view remains centered on `Mega Segin`.

![Cycle to territory display style 3](./screenshots/002-cycle-territory-display-style-3.png)

### How to use it
- Press **Ctrl+9** to cycle to the next style.

### What to expect
- The visual style of the territory rendering updates immediately.

## Cycle to territory display style 4

Style 4 offers a different visual balance between territory fill and map clarity. Comparison is easy as the view remains centered on `Mega Segin`.

![Cycle to territory display style 4](./screenshots/003-cycle-territory-display-style-4.png)

### How to use it
- Press **Ctrl+9** to cycle to the next style.

### What to expect
- The visual style of the territory rendering updates immediately.

## Recolor your empire white on the map

If your player color is difficult to see against the background or neighboring empires, you can toggle your own empire's color to white. This only changes your local view and does not affect how other players see you.

![Recolor your empire white on the map](./screenshots/004-recolor-my-territory-white.png)

### How to use it
- Select one of your own stars.
- Press **w** to toggle your map color to white.

### What to expect
- Your empire's map color changes to white, as seen in the screenshot.

## Green and Grey Scan ETAs for multiple fleets

Knowing exactly when a fleet will be detected is critical for timing your maneuvers. NPA displays color-coded scan ETA labels for fleets approaching a star. In this example, the enemy star `Alshat` is being approached by multiple fleets.

![Green and Grey Scan ETAs for multiple fleets](./screenshots/005-scan-eta-green-and-grey-fleets.png)

### How to use it
- Select an enemy star that fleets are approaching.
- Look for the distinct color-coded ETA labels near each fleet icon.

### What to expect
- **Green Labels:** Indicate a "dark" fleet's first-time detection by this star.
- **Grey Labels:** Indicate when this star will gain a scan lock on a fleet that is already visible via other stars.

## Measure scan ETA with a fake fleet route

You can also use fake fleets to plan routes and see exactly when they will enter enemy scan. This is vital for timing 'dark' jumps where you want to arrive or change course just before being detected.

![Measure scan ETA with a fake fleet route](./screenshots/006-measure-scan-eta-with-fake-fleet.png)

### How to use it
- Press **x** to create a fake planning fleet.
- Add waypoints to the destination.
- Select the destination star (like `${TARGET_STAR_NAME}` in the example) to see the scan ETA for that route.

### What to expect
- As shown in the screenshot, the scan HUD displays the expected entry tick for the planned route.
