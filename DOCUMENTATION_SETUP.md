# NPA Book Documentation Setup

The NPA Book is generated from the numbered E2E documentation sections under `tests/playwright`.

## How Publishing Works

- Source sections are discovered from directories named `001-*`, `002-*`, and so on.
- Each section uses its `DOCS.md` file and referenced `screenshots/` images.
- `npm run docs:book` builds a static site into `book-dist/`.
- `.github/workflows/deploy-book.yml` runs on pushes to `main` that touch the book source files.
- The workflow publishes the generated site to the existing GitHub Pages source: branch `web`, path `/docs`.
- The workflow preserves the existing `docs/CNAME` file on the `web` branch.

## Manual Setup

No manual setup is currently required.

I verified the repository is already configured for GitHub Pages with:

```sh
gh api repos/:owner/:repo/pages
```

The current Pages source is:

```text
branch: web
path: /docs
```

I also verified Actions have write access, which the deploy workflow needs in order to push to `web`:

```sh
gh api repos/:owner/:repo/actions/permissions/workflow
```

If this repository is recreated or the Pages settings are changed, restore the same Pages source with:

```sh
gh api --method PUT repos/:owner/:repo/pages \
  -f 'source[branch]=web' \
  -f 'source[path]=/docs'
```

If workflow write permissions are disabled, restore them with:

```sh
gh api --method PUT repos/:owner/:repo/actions/permissions/workflow \
  -f default_workflow_permissions=write \
  -F can_approve_pull_request_reviews=true
```

## Local Preview

Build the book:

```sh
npm run docs:book
```

Serve the generated static site locally:

```sh
python3 -m http.server 8081 -d book-dist
```

Then open `http://localhost:8081/`.

## Adding A Section

1. Add or regenerate an E2E documentation scenario in a numbered directory such as `tests/playwright/003-example-feature/`.
2. Ensure it writes `DOCS.md` and stores images under `screenshots/`.
3. Run `npm run docs:book` to confirm the new section appears in numeric order.
4. Push to `main`; the workflow will publish the updated book.
