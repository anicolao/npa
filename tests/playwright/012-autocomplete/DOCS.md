# Autocomplete

NPA provides several autocomplete triggers to help you quickly insert player names and star names into text fields.

## Autocompleting a player name by their ID

You can quickly insert a player's name by their numeric ID.

![Autocompleting a player name by their ID](./screenshots/000-player-id-autocomplete.png)

### How to use it
- Type `[[` followed by the player's ID number.
- Press **]** to complete the name.

### What to expect
- The `[[ID]]` sequence is replaced by the player's full alias enclosed in double brackets.

## Cycling through multiple players matching a prefix

When multiple players match your search, you can cycle through them.

![Cycling through multiple players matching a prefix](./screenshots/001-player-name-cycling.png)

### How to use it
- Type `[[` followed by the start of a player's name.
- Press **]** repeatedly to cycle through all matching players.

### What to expect
- NPA cycles through all players whose names contain the text you typed.

## Autocompleting star names

Star names can also be autocompleted.

![Autocompleting star names](./screenshots/002-star-name-cycling.png)

### How to use it
- Type `[[` followed by part of a star's name.
- Press **]** to complete the name.

### What to expect
- The star name is inserted, correctly formatted for game links.
