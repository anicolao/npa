# Embedded Content Validation

Verify that NPA renders embedded images and YouTube videos when provided with specific URL patterns in double brackets.

Documentation target: `Embedded content`

Companion user documentation: [DOCS.md](./DOCS.md)

## Open the NP Agent UI

![Open the NP Agent UI](./screenshots/000-open-npa-ui.png)

### Verifications
- [x] Pressing ` opens the NPA report screen

## Render an embedded image from Imgur

![Render an embedded image from Imgur](./screenshots/001-embedded-image.png)

### Verifications
- [x] Double-bracketed Imgur URLs render as <img> tags

## Render an embedded YouTube video

![Render an embedded YouTube video](./screenshots/002-embedded-youtube.png)

### Verifications
- [x] Double-bracketed YouTube URLs render as <iframe> embeds
