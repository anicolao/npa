# Managing API Keys

API keys allow NPA to pull data from other players or your own past games. This section covers how to find, enter, and use these keys.

## Detecting API keys from messages

NPA automatically scans your messages for API keys shared by allies. When a key is found in the format `[[api:XXXXXX]]`, it is added to your local database.

![Detecting API keys from messages](./screenshots/000-api-key-detection.png)

### How to use it
- Open your inbox and look for messages from allies containing API keys.
- NPA will automatically pick up any key in the format `[[api:XXXXXX]]`.

### What to expect
- The key is detected without any manual entry.
- Detected keys appear in the API dashboard (hotkey **k**).

## Viewing the API keys dashboard details

The API keys dashboard provides a central view of all keys you have encountered in the current game. Press **k** to open this report.

![Viewing the API keys dashboard details](./screenshots/001-api-keys-dashboard.png)

### How to use it
- Press **k** at any time to see the list of known keys.
- Use the **Merge** links to pull data from those keys into your current view.

### What to expect
- The report shows the owner (if known) and the status of each key.
- Keys detected from messages are listed under 'All Seen Keys'.

## Using autocomplete for your own API key

When composing a message, you can easily insert your own API key to share with allies. NPA provides an autocomplete helper for this purpose.

![Using autocomplete for your own API key](./screenshots/002-api-key-autocomplete.png)

### How to use it
- Start typing `[[api:` in any message or note field.
- NPA will automatically complete the tag with your own API key.

### What to expect
- The full `[[api:XXXXXX]]` tag is inserted automatically.
- This makes sharing your data with allies quick and error-free.
