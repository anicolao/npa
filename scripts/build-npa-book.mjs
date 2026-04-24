#!/usr/bin/env node

import * as fs from "node:fs/promises";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const repoRoot = path.resolve(path.dirname(__filename), "..");
const defaultOutDir = path.join(repoRoot, "book-dist");

const outDir = path.resolve(
  repoRoot,
  readArg("--out") ?? process.env.NPA_BOOK_OUT_DIR ?? defaultOutDir,
);
const sourceDir = path.join(repoRoot, "tests", "playwright");

const chapters = await discoverChapters();

if (chapters.length === 0) {
  throw new Error(`No numbered DOCS.md sections found under ${sourceDir}`);
}

await fs.rm(outDir, { force: true, recursive: true });
await fs.mkdir(outDir, { recursive: true });
await fs.mkdir(path.join(outDir, "assets"), { recursive: true });

const renderedChapters = [];
for (const chapter of chapters) {
  const markdown = await fs.readFile(chapter.docsPath, "utf8");
  renderedChapters.push(await renderChapter(chapter, markdown));
}

await fs.writeFile(
  path.join(outDir, "index.html"),
  buildPage(renderedChapters),
);
await fs.writeFile(path.join(outDir, ".nojekyll"), "");

console.log(
  `Built NPA Book with ${renderedChapters.length} sections in ${path.relative(
    repoRoot,
    outDir,
  )}`,
);

function readArg(name) {
  const index = process.argv.indexOf(name);
  if (index === -1) return undefined;
  return process.argv[index + 1];
}

async function discoverChapters() {
  const entries = await fs.readdir(sourceDir, { withFileTypes: true });
  const numberedDirs = entries
    .filter((entry) => entry.isDirectory() && /^\d{3}-/.test(entry.name))
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b, "en"));

  const discovered = [];
  for (const dirName of numberedDirs) {
    const docsPath = path.join(sourceDir, dirName, "DOCS.md");
    try {
      await fs.access(docsPath);
    } catch {
      continue;
    }

    discovered.push({
      dirName,
      docsPath,
      sourcePath: path.join(sourceDir, dirName),
      number: dirName.match(/^(\d{3})/)?.[1] ?? String(discovered.length + 1),
      slug: slugify(dirName.replace(/^\d{3}-/, "")),
    });
  }

  return discovered;
}

async function renderChapter(chapter, markdown) {
  const lines = markdown.split(/\r?\n/);
  const headings = [];
  const html = [];
  const usedIds = new Set();
  let paragraph = [];
  let list = [];
  let title = chapter.dirName;

  const flushParagraph = () => {
    if (!paragraph.length) return;
    html.push(`<p>${formatInline(paragraph.join(" "))}</p>`);
    paragraph = [];
  };

  const flushList = () => {
    if (!list.length) return;
    html.push("<ul>");
    for (const item of list) {
      html.push(`<li>${formatInline(item)}</li>`);
    }
    html.push("</ul>");
    list = [];
  };

  for (const line of lines) {
    if (line.trim() === "") {
      flushParagraph();
      flushList();
      continue;
    }

    const heading = line.match(/^(#{1,4})\s+(.+)$/);
    if (heading) {
      flushParagraph();
      flushList();

      const sourceLevel = heading[1].length;
      const headingText = heading[2].trim();
      const headingId = uniqueId(
        sourceLevel === 1
          ? `section-${chapter.number}`
          : `section-${chapter.number}-${slugify(headingText)}`,
        usedIds,
      );
      const outputLevel = Math.min(sourceLevel + 1, 5);

      if (sourceLevel === 1) {
        title = headingText;
        html.push(`<p class="chapter-kicker">Section ${chapter.number}</p>`);
        html.push(
          `<h${outputLevel} id="${headingId}" class="chapter-title">${formatInline(
            headingText,
          )}</h${outputLevel}>`,
        );
      } else {
        headings.push({
          id: headingId,
          title: headingText,
          level: sourceLevel,
        });
        html.push(
          `<h${outputLevel} id="${headingId}">${formatInline(
            headingText,
          )}</h${outputLevel}>`,
        );
      }
      continue;
    }

    const image = line.match(/^!\[(.*)]\((.+)\)$/);
    if (image) {
      flushParagraph();
      flushList();

      const alt = image[1].trim();
      const source = image[2].trim();
      const imagePath = await copyImage(chapter, source);
      html.push(`<figure>`);
      html.push(
        `<img src="${escapeAttribute(imagePath)}" alt="${escapeAttribute(
          alt,
        )}" loading="lazy">`,
      );
      html.push(`<figcaption>${formatInline(alt)}</figcaption>`);
      html.push(`</figure>`);
      continue;
    }

    const listItem = line.match(/^-\s+(.+)$/);
    if (listItem) {
      flushParagraph();
      list.push(listItem[1].trim());
      continue;
    }

    flushList();
    paragraph.push(line.trim());
  }

  flushParagraph();
  flushList();

  return {
    ...chapter,
    title,
    headings,
    html: html.join("\n"),
  };
}

async function copyImage(chapter, source) {
  if (/^[a-z]+:/i.test(source)) return source;

  const resolvedSource = path.resolve(chapter.sourcePath, source);
  const relativeSource = path.relative(chapter.sourcePath, resolvedSource);
  const outputRelative = path.join("assets", chapter.dirName, relativeSource);
  const outputPath = path.join(outDir, outputRelative);

  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.copyFile(resolvedSource, outputPath);

  return outputRelative.split(path.sep).join("/");
}

function buildPage(renderedChapters) {
  const nav = renderedChapters
    .map((chapter) => {
      const childLinks = chapter.headings
        .filter((heading) => heading.level === 2)
        .map(
          (heading) =>
            `<a class="nav-step" href="#${heading.id}">${escapeHtml(
              heading.title,
            )}</a>`,
        )
        .join("\n");

      return `<div class="nav-section">
        <a class="nav-chapter" href="#section-${chapter.number}">
          <span>${chapter.number}</span>${escapeHtml(chapter.title)}
        </a>
        ${childLinks}
      </div>`;
    })
    .join("\n");

  const chaptersHtml = renderedChapters
    .map(
      (
        chapter,
      ) => `<article class="chapter" aria-labelledby="section-${chapter.number}">
${chapter.html}
</article>`,
    )
    .join("\n");

  const baseHref = process.env.NPA_BOOK_BASE_HREF ?? "./";

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <base href="${baseHref}">
  <title>NPA Book</title>
  <meta name="description" content="A practical guide to Neptune's Pride Agent, generated from the verified E2E documentation scenarios.">
  <style>
${buildCss()}
  </style>
</head>
<body>
  <header class="site-header">
    <a class="brand" href="#top" aria-label="NPA Book home">
      <span class="brand-mark">NPA</span>
      <span>NPA Book</span>
    </a>
    <a class="repo-link" href="https://github.com/anicolao/npa">GitHub</a>
  </header>
  <div class="layout" id="top">
    <nav class="book-nav" aria-label="Book sections">
      <p class="nav-title">Sections</p>
      ${nav}
    </nav>
    <main>
      <section class="hero" aria-labelledby="book-title">
        <p class="eyebrow">Neptune's Pride Agent field guide</p>
        <h1 id="book-title">NPA Book</h1>
        <p class="lede">A lightweight manual built from verified E2E documentation scenarios. Every section below is backed by generated screenshots from the extension running against the test game fixture.</p>
      </section>
      ${chaptersHtml}
      <footer>
        Generated from <code>tests/playwright/*/DOCS.md</code>. Update the numbered E2E sections to extend this book.
      </footer>
    </main>
  </div>
</body>
</html>
`;
}

function buildCss() {
  return `:root {
  color-scheme: light;
  --bg: #f7f4ec;
  --panel: #fffdf8;
  --ink: #1f2933;
  --muted: #637083;
  --line: #d8d0c0;
  --accent: #0f766e;
  --accent-strong: #0b4f4a;
  --gold: #b7791f;
  --code-bg: #eef2f1;
  font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
}

* {
  box-sizing: border-box;
}

html {
  scroll-behavior: smooth;
}

body {
  margin: 0;
  background: var(--bg);
  color: var(--ink);
  line-height: 1.6;
}

a {
  color: var(--accent-strong);
}

.site-header {
  align-items: center;
  background: rgba(255, 253, 248, 0.92);
  border-bottom: 1px solid var(--line);
  display: flex;
  justify-content: space-between;
  min-height: 64px;
  padding: 0 24px;
  position: sticky;
  top: 0;
  z-index: 10;
}

.brand,
.repo-link {
  align-items: center;
  color: var(--ink);
  display: inline-flex;
  font-weight: 700;
  gap: 10px;
  text-decoration: none;
}

.repo-link {
  border: 1px solid var(--line);
  border-radius: 6px;
  font-size: 0.9rem;
  padding: 6px 10px;
}

.brand-mark {
  background: var(--accent-strong);
  border-radius: 4px;
  color: white;
  font-size: 0.78rem;
  letter-spacing: 0;
  padding: 4px 6px;
}

.layout {
  display: grid;
  gap: 40px;
  grid-template-columns: minmax(210px, 280px) minmax(0, 1fr);
  margin: 0 auto;
  max-width: 1440px;
  padding: 32px 28px 64px;
}

.book-nav {
  align-self: start;
  border-right: 1px solid var(--line);
  max-height: calc(100vh - 96px);
  overflow: auto;
  padding: 8px 24px 24px 0;
  position: sticky;
  top: 88px;
}

.nav-title,
.eyebrow,
.chapter-kicker {
  color: var(--gold);
  font-size: 0.78rem;
  font-weight: 800;
  letter-spacing: 0;
  margin: 0 0 12px;
  text-transform: uppercase;
}

.nav-section {
  border-top: 1px solid var(--line);
  padding: 14px 0;
}

.nav-chapter,
.nav-step {
  display: block;
  text-decoration: none;
}

.nav-chapter {
  color: var(--ink);
  font-weight: 800;
  line-height: 1.3;
}

.nav-chapter span {
  color: var(--accent);
  display: block;
  font-size: 0.78rem;
  margin-bottom: 2px;
}

.nav-step {
  color: var(--muted);
  font-size: 0.9rem;
  line-height: 1.35;
  margin-top: 9px;
}

main {
  min-width: 0;
}

.hero {
  border-bottom: 1px solid var(--line);
  padding: 28px 0 44px;
}

h1,
h2,
h3,
h4 {
  line-height: 1.1;
  margin: 0;
}

h1 {
  font-size: clamp(3rem, 8vw, 6.5rem);
}

.lede {
  color: var(--muted);
  font-size: clamp(1.1rem, 2vw, 1.45rem);
  max-width: 820px;
}

.chapter {
  border-bottom: 1px solid var(--line);
  padding: 56px 0;
}

.chapter-title {
  font-size: clamp(2rem, 4vw, 3.5rem);
  max-width: 980px;
}

.chapter > p {
  max-width: 840px;
}

h3 {
  font-size: clamp(1.45rem, 3vw, 2.3rem);
  margin-top: 56px;
  max-width: 900px;
}

h4 {
  color: var(--accent-strong);
  font-size: 1rem;
  margin-top: 26px;
}

ul {
  margin: 10px 0 0;
  max-width: 860px;
  padding-left: 1.2rem;
}

li + li {
  margin-top: 6px;
}

code {
  background: var(--code-bg);
  border-radius: 4px;
  font-family: ui-monospace, SFMono-Regular, Consolas, "Liberation Mono", monospace;
  font-size: 0.92em;
  padding: 0.12em 0.32em;
}

figure {
  margin: 24px 0 0;
}

img {
  background: #0b1020;
  border: 1px solid var(--line);
  border-radius: 8px;
  display: block;
  height: auto;
  max-width: 100%;
}

figcaption {
  color: var(--muted);
  font-size: 0.9rem;
  margin-top: 8px;
}

footer {
  color: var(--muted);
  font-size: 0.95rem;
  padding: 32px 0 0;
}

@media (max-width: 860px) {
  .site-header {
    padding: 0 16px;
  }

  .layout {
    display: block;
    padding: 20px 16px 44px;
  }

  .book-nav {
    border: 1px solid var(--line);
    border-radius: 8px;
    max-height: none;
    overflow: visible;
    padding: 16px;
    position: static;
  }

  .nav-step {
    display: none;
  }

  .hero {
    padding-top: 36px;
  }
}`;
}

function formatInline(value) {
  const parts = [];
  let current = 0;
  const regex = /\*\*([^*]+)\*\*|`([^`]+)`|\[([^\]]+)]\(([^)]+)\)/g;
  let match;

  while ((match = regex.exec(value)) !== null) {
    if (match.index > current) {
      parts.push(escapeHtml(value.substring(current, match.index)));
    }
    if (match[1]) {
      parts.push(`<strong>${escapeHtml(match[1])}</strong>`);
    } else if (match[2]) {
      parts.push(`<code>${escapeHtml(match[2])}</code>`);
    } else if (match[3]) {
      parts.push(`<a href="${escapeAttribute(match[4])}">${escapeHtml(match[3])}</a>`);
    }
    current = regex.lastIndex;
  }
  if (current < value.length) {
    parts.push(escapeHtml(value.substring(current)));
  }

  return parts.join("");
}

function slugify(value) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function uniqueId(base, usedIds) {
  let id = base;
  let suffix = 2;
  while (usedIds.has(id)) {
    id = `${base}-${suffix}`;
    suffix += 1;
  }
  usedIds.add(id);
  return id;
}

function escapeHtml(value) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escapeAttribute(value) {
  return escapeHtml(value).replace(/'/g, "&#39;");
}
