# Embedded Images and Videos

NPA supports rich content embedding in messages and reports. By wrapping a valid Imgur, ibb.co, or YouTube URL in double brackets, you can display images or video players directly within the interface.

## Open the NP Agent UI

Open the Agent UI to prepare for content injection. Images and videos can be rendered in any area that uses the NPA-enhanced Crux.format, such as reports or message logs.

![Open the NP Agent UI](./screenshots/000-open-npa-ui.png)

### How to use it
- Press **`** to open the Agent UI.

### What to expect
- The NP Agent overlay appears.

## Render an embedded image from Imgur

Valid image URLs from supported hosts (Imgur, ibb.co) wrapped in `[[...]]` are automatically converted into full-width images.

![Render an embedded image from Imgur](./screenshots/001-embedded-image.png)

### How to use it
- Include a URL like `[[https://i.imgur.com/example.png]]` in a message or report.

### What to expect
- The URL is replaced by an `<img>` tag displaying the referenced image.

## Render an embedded YouTube video

YouTube watch URLs wrapped in `[[...]]` are converted into an embedded player with a fallback link to open the video in a new tab.

![Render an embedded YouTube video](./screenshots/002-embedded-youtube.png)

### How to use it
- Include a YouTube URL like `[[https://www.youtube.com/watch?v=dQw4w9WgXcQ]]` in your text.

### What to expect
- An `<iframe>` player appears centered in the text area, followed by a direct link.
