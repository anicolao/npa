# Autocomplete Scenarios

Verify and document NPA's autocomplete triggers and cycling behavior in the game's messaging UI.

Documentation target: `012-autocomplete`

Companion user documentation: [DOCS.md](./DOCS.md)

## Autocompleting a player name by their ID

![Autocompleting a player name by their ID](./screenshots/000-player-id-autocomplete.png)

### Verifications
- [x] Typing `[[1` and pressing `]` inserts the name of the player with ID 1.

## Cycling through multiple players matching a prefix

![Cycling through multiple players matching a prefix](./screenshots/001-player-name-cycling.png)

### Verifications
- [x] Repeatedly pressing `]` cycles through all matching player names.

## Autocompleting star names

![Autocompleting star names](./screenshots/002-star-name-cycling.png)

### Verifications
- [x] Star names are also included in the autocomplete suggestions.
