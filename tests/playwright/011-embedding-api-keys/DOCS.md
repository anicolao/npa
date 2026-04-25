# How to Embed and Manage API Keys

NPA allows you to share your API key with allies by embedding it in messages. It also automatically detects keys shared by others and provides a report to manage them.

## Autocomplete your own API key in a text input

When writing a message, you can easily share your own API key with an ally. NPA provides an autocomplete shortcut to avoid manual copy-pasting.

![Autocomplete your own API key in a text input](./screenshots/000-autocomplete-api-key.png)

### How to use it
- Open a message composition window.
- Type `[[api:` (double left bracket followed by 'api' and a colon).
- NPA will automatically fill in your current API key and close the brackets.

### What to expect
- The text `[[api:` is replaced with `[[api:YOUR_KEY_HERE]]`.

## Detect an API key in a message

NPA scans your incoming messages for `[[api:CODE]]` tags. Any keys found are automatically added to the agent's 'Seen Keys' list, allowing you to easily view data from your allies.

![Detect an API key in a message](./screenshots/001-detect-api-key.png)

### How to use it
- Ask an ally to send you their API key using the `[[api:CODE]]` format.
- Once the message is received, NPA will detect it automatically.

### What to expect
- The detected key appears in the API Keys report.

## Show the API Keys report

The API Keys report (hotkey **k**) provides a central location to manage all API keys you have encountered in the current game.

![Show the API Keys report](./screenshots/002-api-keys-report.png)

### How to use it
- Press **k** at any time to open the API Keys report.
- View the list of keys, their associated players, and the time range of data available.
- Use 'View' to switch your game view to that key's perspective.
- Use 'Merge' to combine data from multiple keys into your current view.

### What to expect
- A table showing all known keys and their status.
