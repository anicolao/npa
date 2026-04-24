# Territory Display And Scanning HUD

The territory and scanning HUD overlays provide essential context for both logistics and intelligence. They visualize the scanning and fleet range of any selected empire, helping you identify safe routes and imminent threats at a glance.

## Visualize empire reach with territory overlays

Selecting any star highlights the territory owned by that empire, visualizing both their current scanning range and their immediate fleet reach. This overlay is a vital tool for understanding the "shape" of an empire and where its influence begins and ends.

![Visualize empire reach with territory overlays](./screenshots/000-show-selected-empire-territory.png)

### How to use it
- Select any star on the map to see the territory of its owner.
- Zoom out to see the full extent of their local reach.

### What to expect
- The map displays a shaded overlay representing the empire's scanning and fleet coverage.
- Neighboring stars (such as `Mega Segin` in the example) remain visible for spatial orientation.

## Cycle to territory rendering style: Bright Haze

NPA offers four distinct rendering styles so you can choose the one that provides the best clarity for your current needs: **Dim Haze**, **Bright Haze**, **Black Background with Outlines**, and **Outlines Only**.

![Cycle to territory rendering style: Bright Haze](./screenshots/001-cycle-territory-display-style-2.png)

### How to use it
- Press **Ctrl+9** to cycle through the available styles.

### What to expect
- The rendering updates to the **Bright Haze** style.
- The view remains centered so you can easily compare the visual impact of each mode.

## Cycle to territory rendering style: Black Background with Outlines

NPA offers four distinct rendering styles so you can choose the one that provides the best clarity for your current needs: **Dim Haze**, **Bright Haze**, **Black Background with Outlines**, and **Outlines Only**.

![Cycle to territory rendering style: Black Background with Outlines](./screenshots/002-cycle-territory-display-style-3.png)

### How to use it
- Press **Ctrl+9** to cycle through the available styles.

### What to expect
- The rendering updates to the **Black Background with Outlines** style.
- The view remains centered so you can easily compare the visual impact of each mode.

## Cycle to territory rendering style: Outlines Only

NPA offers four distinct rendering styles so you can choose the one that provides the best clarity for your current needs: **Dim Haze**, **Bright Haze**, **Black Background with Outlines**, and **Outlines Only**.

![Cycle to territory rendering style: Outlines Only](./screenshots/003-cycle-territory-display-style-4.png)

### How to use it
- Press **Ctrl+9** to cycle through the available styles.

### What to expect
- The rendering updates to the **Outlines Only** style.
- The view remains centered so you can easily compare the visual impact of each mode.

## Toggle political map borders and empire names

To further reduce map clutter, you can toggle the game's default political map borders and empire names off or on. This is especially useful when the map is crowded with fleet routes or scanning ETAs.

![Toggle political map borders and empire names](./screenshots/004-toggle-political-borders.png)

### How to use it
- Press **Ctrl+0** to toggle the visibility of political borders and empire labels.

### What to expect
- The political borders and empire name labels disappear or reappear immediately.

## Recolor your empire white on the map

If your player color is difficult to see against the background or neighboring empires, you can toggle your own empire's color to white. This is a local visual aid that helps you track your own borders more easily without affecting other players.

![Recolor your empire white on the map](./screenshots/005-recolor-my-territory-white.png)

### How to use it
- Select one of your own stars.
- Press **w** to toggle your map color to white.

### What to expect
- Your empire's map color changes to white, as seen in the screenshot.

## Green and Grey Scan ETAs for multiple fleets

Knowing exactly when a fleet will be detected is critical for timing your maneuvers. NPA displays color-coded scan ETA labels for fleets approaching a star. In this example, the enemy star `Alshat` is being approached by multiple fleets.

![Green and Grey Scan ETAs for multiple fleets](./screenshots/006-scan-eta-green-and-grey-fleets.png)

### How to use it
- Select an enemy star that fleets are approaching.
- Look for the distinct color-coded ETA labels near each fleet icon.

### What to expect
- **Green Labels:** Indicate a "dark" fleet's first-time detection by this star.
- **Grey Labels:** Indicate when this star will gain a scan lock on a fleet that is already visible via other stars.

## Measure scan ETA with a fake fleet route

You can also use fake fleets to plan routes and see exactly when they will enter enemy scan. This is vital for timing 'dark' jumps where you want to arrive or change course just before being detected.

![Measure scan ETA with a fake fleet route](./screenshots/007-measure-scan-eta-with-fake-fleet.png)

### How to use it
- Press **x** to create a fake planning fleet.
- Add waypoints to the destination.
- Select the destination star (like `${TARGET_STAR_NAME}` in the example) to see the scan ETA for that route.

### What to expect
- As shown in the screenshot, the scan HUD displays the expected entry tick for the planned route.
