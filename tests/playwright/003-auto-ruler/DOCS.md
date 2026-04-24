# Interpreting and Controlling the Auto-Ruler

The auto-ruler is a tactical overlay that automatically measures distances and arrival times between a selected star and its neighbors. It helps you quickly identify which of your stars can provide timely support and how soon enemy threats might arrive.

## View automatic distance measurements to the nearest stars

When you select a star, NPA automatically draws 'ruler' lines to the most relevant neighboring stars. These lines provide immediate tactical information without requiring you to manually measure each route.

![View automatic distance measurements to the nearest stars](./screenshots/000-show-basic-auto-ruler.png)

### How to use it
- Select a star on the map (like `Hot Sham` in the example) to activate the auto-ruler.
- Look for the colored lines extending to nearby stars.

### What to expect
- **Red Lines** indicate connections to enemy-owned stars.
- **Green or Grey Lines** indicate connections to stars owned by you or your allies.
- Tick numbers (e.g., `[[Tick #529]]`) show exactly when a fleet traveling at your current speed would arrive.

## Increase the number of stars shown by the auto-ruler

You can control how many neighbors the auto-ruler identifies. Increasing the power reveals more distant threats and potential support stars.

![Increase the number of stars shown by the auto-ruler](./screenshots/001-increase-ruler-power.png)

### How to use it
- Press **9** to increase the number of stars the auto-ruler connects to.

### What to expect
- More ruler lines appear on the map, reaching further out from the selected star.

## Decrease the number of stars shown by the auto-ruler

If the map becomes too cluttered, you can decrease the auto-ruler power to focus only on the most immediate neighbors.

![Decrease the number of stars shown by the auto-ruler](./screenshots/002-decrease-ruler-power.png)

### How to use it
- Press **8** to decrease the number of stars the auto-ruler connects to.

### What to expect
- Distant ruler lines disappear, leaving only the closest connections visible.

## Distinguish between effective and ineffective support

The auto-ruler uses color to help you make split-second defensive decisions. It compares the arrival time of enemy fleets against your own support fleets.

![Distinguish between effective and ineffective support](./screenshots/003-understand-support-colors.png)

### How to use it
- Observe the colors of the lines connecting to your own stars.

### What to expect
- **Green Lines** represent 'Effective' support: these stars can reach the selected location *before* the closest enemy can.
- **Grey Lines** represent 'Ineffective' support: these stars are too far away to help before the enemy arrives.

### Caveats
- Support effectiveness is calculated based on the closest detected enemy star. Always verify if the enemy has closer hidden fleets.
