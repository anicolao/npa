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
    const text = paragraph.join(" ");
    html.push(`<div class="doc-block" data-section="${chapter.number}" data-text="${escapeAttribute(text)}">`);
    html.push(`<p>${formatInline(text)}</p>`);
    html.push(`<a class="bug-link" title="Report an issue with this section" aria-label="Report issue"></a>`);
    html.push(`</div>`);
    paragraph = [];
  };

  const flushList = () => {
    if (!list.length) return;
    html.push("<ul>");
    for (const item of list) {
      html.push(
        `<li class="doc-block" data-section="${
          chapter.number
        }" data-text="${escapeAttribute(item)}">`,
      );
      html.push(formatInline(item));
      html.push(
        `<a class="bug-link" title="Report an issue with this section" aria-label="Report issue"></a>`,
      );
      html.push("</li>");
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
          `<div class="doc-block" data-section="${
            chapter.number
          }" data-text="${escapeAttribute(headingText)}">`,
        );
        html.push(
          `<h${outputLevel} id="${headingId}" class="chapter-title">${formatInline(
            headingText,
          )}</h${outputLevel}>`,
        );
        html.push(
          `<a class="bug-link" title="Report an issue with this section" aria-label="Report issue"></a>`,
        );
        html.push(`</div>`);
      } else {
        headings.push({
          id: headingId,
          title: headingText,
          level: sourceLevel,
        });
        html.push(
          `<div class="doc-block" data-section="${
            chapter.number
          }" data-text="${escapeAttribute(headingText)}">`,
        );
        html.push(
          `<h${outputLevel} id="${headingId}">${formatInline(
            headingText,
          )}</h${outputLevel}>`,
        );
        html.push(
          `<a class="bug-link" title="Report an issue with this section" aria-label="Report issue"></a>`,
        );
        html.push(`</div>`);
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
      html.push(`<div class="doc-block" data-section="${chapter.number}" data-text="Image: ${escapeAttribute(alt)}">`);
      html.push(`<figure>`);
      html.push(
        `<img src="${escapeAttribute(imagePath)}" alt="${escapeAttribute(
          alt,
        )}" loading="lazy">`,
      );
      html.push(`<figcaption>${formatInline(alt)}</figcaption>`);
      html.push(`</figure>`);
      html.push(`<a class="bug-link" title="Report an issue with this section" aria-label="Report issue"></a>`);
      html.push(`</div>`);
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
        <p class="lede">A practical guide to mastering the galaxy with NPA. This manual provides clear, visual walkthroughs of the planning tools, overlays, and coordination features designed to give you a tactical edge in Neptune's Pride.</p>
      </section>
      ${chaptersHtml}
      <footer>
        Documentation for NPA. Update the documentation sections in the repository to extend this book.
      </footer>
    </main>
  </div>
  <script>
    (function() {
      const VS = \`
        attribute vec2 a_position;
        attribute vec2 a_texCoord;
        varying vec2 v_texCoord;
        void main() {
          gl_Position = vec4(a_position, 0, 1);
          v_texCoord = a_texCoord;
        }
      \`;

      const FS = \`
        precision mediump float;
        uniform sampler2D u_image;
        uniform vec2 u_resolution;
        uniform vec2 u_mouse;
        varying vec2 v_texCoord;

        void main() {
          vec2 uv = v_texCoord;
          vec2 mouse = vec2(u_mouse.x, u_resolution.y - u_mouse.y);
          vec2 zoom_pos = mouse / u_resolution;
          
          float zoom_times = 3.0;
          float lens_radius = 0.25;
          float ring_width = 0.02;
          vec4 ring_color = vec4(0.1, 0.2, 0.2, 1.0);

          vec2 zoomed_uv = (uv - zoom_pos) / zoom_times + zoom_pos;

          // Aspect correction for circularity
          float aspect = u_resolution.x / u_resolution.y;
          vec2 p = uv;
          vec2 z = zoom_pos;
          p.x *= aspect;
          z.x *= aspect;
          
          float d = length(p - z);
          
          float mask = 1.0 - smoothstep(lens_radius - 0.005, lens_radius + 0.005, d);
          float outer = 1.0 - smoothstep(lens_radius + ring_width/2.0 - 0.005, lens_radius + ring_width/2.0 + 0.005, d);
          float inner = 1.0 - smoothstep(lens_radius - ring_width/2.0 - 0.005, lens_radius - ring_width/2.0 + 0.005, d);
          float r_mask = outer - inner;

          vec4 background = texture2D(u_image, uv);
          vec4 zoomed_bg = texture2D(u_image, zoomed_uv);
          
          gl_FragColor = mix(background, zoomed_bg, mask) + ring_color * r_mask;
        }
      \`;

      let gl, program, positionBuffer, texCoordBuffer, texture;
      let canvas = document.createElement('canvas');
      canvas.className = 'magnifier-canvas';
      let activeImage = null;
      let isPinned = false;
      let lastMousePos = { x: 0, y: 0 };

      function initGL() {
        gl = canvas.getContext('webgl');
        if (!gl) return;

        const createShader = (gl, type, source) => {
          const shader = gl.createShader(type);
          gl.shaderSource(shader, source);
          gl.compileShader(shader);
          return shader;
        };

        program = gl.createProgram();
        gl.attachShader(program, createShader(gl, gl.VERTEX_SHADER, VS));
        gl.attachShader(program, createShader(gl, gl.FRAGMENT_SHADER, FS));
        gl.linkProgram(program);
        gl.useProgram(program);

        positionBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 1,-1, -1,1, -1,1, 1,-1, 1,1]), gl.STATIC_DRAW);

        texCoordBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, texCoordBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0,0, 1,0, 0,1, 0,1, 1,0, 1,1]), gl.STATIC_DRAW);

        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
        texture = gl.createTexture();
      }

      function update(img, x, y) {
        if (!gl) initGL();
        if (!gl) return;

        if (activeImage !== img) {
          activeImage = img;
          gl.bindTexture(gl.TEXTURE_2D, texture);
          gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
          
          canvas.width = img.clientWidth;
          canvas.height = img.clientHeight;
          img.parentNode.appendChild(canvas);
        }

        gl.viewport(0, 0, canvas.width, canvas.height);
        
        const aPos = gl.getAttribLocation(program, 'a_position');
        gl.enableVertexAttribArray(aPos);
        gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
        gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

        const aTex = gl.getAttribLocation(program, 'a_texCoord');
        gl.enableVertexAttribArray(aTex);
        gl.bindBuffer(gl.ARRAY_BUFFER, texCoordBuffer);
        gl.vertexAttribPointer(aTex, 2, gl.FLOAT, false, 0, 0);

        gl.uniform2f(gl.getUniformLocation(program, 'u_resolution'), canvas.width, canvas.height);
        gl.uniform2f(gl.getUniformLocation(program, 'u_mouse'), x, y);

        gl.drawArrays(gl.TRIANGLES, 0, 6);
        canvas.style.display = 'block';
      }

      document.addEventListener('mousemove', (e) => {
        if (isPinned) return;
        if (e.target.tagName === 'IMG' && e.target.closest('figure')) {
          const rect = e.target.getBoundingClientRect();
          lastMousePos = { x: e.clientX - rect.left, y: e.clientY - rect.top };
          update(e.target, lastMousePos.x, lastMousePos.y);
        } else if (activeImage) {
          canvas.style.display = 'none';
          activeImage = null;
        }
      });

      function handleTouch(e) {
        if (isPinned) return;
        const touch = e.touches[0];
        if (touch.target.tagName === 'IMG' && touch.target.closest('figure')) {
          const rect = touch.target.getBoundingClientRect();
          lastMousePos = { x: touch.clientX - rect.left, y: touch.clientY - rect.top };
          update(touch.target, lastMousePos.x, lastMousePos.y);
        }
      }
      document.addEventListener('touchstart', handleTouch, { passive: true });
      document.addEventListener('touchmove', handleTouch, { passive: true });

      document.addEventListener('click', (e) => {
        if (e.target.tagName === 'IMG' && e.target.closest('figure')) {
          const rect = e.target.getBoundingClientRect();
          const x = e.clientX - rect.left;
          const y = e.clientY - rect.top;
          
          if (isPinned && activeImage === e.target) {
            isPinned = false;
            if (!matchMedia('(pointer: fine)').matches) {
              canvas.style.display = 'none';
              activeImage = null;
            } else {
              lastMousePos = { x, y };
              update(e.target, x, y);
            }
          } else {
            isPinned = true;
            lastMousePos = { x, y };
            update(e.target, x, y);
          }
        } else {
          isPinned = false;
          if (activeImage) {
            canvas.style.display = 'none';
            activeImage = null;
          }
        }
      });

      window.addEventListener('resize', () => {
        if (activeImage) {
          canvas.width = activeImage.clientWidth;
          canvas.height = activeImage.clientHeight;
          if (isPinned) update(activeImage, lastMousePos.x, lastMousePos.y);
        }
      });
    })();

    document.addEventListener('click', (e) => {
      if (e.target.classList.contains('bug-link')) {
        const block = e.target.closest('.doc-block');
        const section = block.getAttribute('data-section');
        const text = block.getAttribute('data-text');
        const title = "Clarify documentation section " + section;
        const body = "Quoted documentation:\\n> " + text + "\\n\\nFILL IN FEEDBACK HERE";
        const url = "https://github.com/anicolao/npa/issues/new?title=" + encodeURIComponent(title) + "&body=" + encodeURIComponent(body);
        window.open(url, '_blank');
      }
    });
  </script>
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
  --text-width: 840px;
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
  max-width: var(--text-width);
}

.chapter {
  border-bottom: 1px solid var(--line);
  padding: 56px 0;
}

.chapter-title {
  font-size: clamp(2rem, 4vw, 3.5rem);
  max-width: calc(var(--text-width) + 140px);
}

.chapter > p {
  max-width: var(--text-width);
}

h3 {
  font-size: clamp(1.45rem, 3vw, 2.3rem);
  margin-top: 56px;
  max-width: calc(var(--text-width) + 60px);
}

h4 {
  color: var(--accent-strong);
  font-size: 1rem;
  margin-top: 26px;
}

ul {
  margin: 10px 0 0;
  max-width: var(--text-width);
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
  margin: 32px 0 0;
  max-width: calc(var(--text-width) * 0.9);
}

img {
  background: #0b1020;
  border: 1px solid var(--line);
  border-radius: 8px;
  display: block;
  height: auto;
  max-width: 100%;
  cursor: crosshair;
}

.magnifier-canvas {
  position: absolute;
  top: 0;
  left: 0;
  pointer-events: none;
  border-radius: 8px;
  z-index: 5;
}

.doc-block figure {
  position: relative;
}

figcaption {
  color: var(--muted);
  font-size: 0.9rem;
  margin-top: 12px;
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

  .bug-link {
    display: none;
  }
}

.doc-block {
  position: relative;
}

.bug-link {
  position: absolute;
  left: -32px;
  top: 4px;
  width: 20px;
  height: 20px;
  opacity: 0;
  transition: opacity 0.2s;
  cursor: pointer;
  background-image: url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="%23b7791f" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-bug"><path d="m8 2 1.88 1.88"/><path d="M14.12 3.88 16 2"/><path d="M9 7.13v-1a3.003 3.003 0 1 1 6 0v1"/><path d="M12 20c-3.3 0-6-2.7-6-6v-3a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v3c0 3.3-2.7 6-6 6"/><path d="M12 20v-9"/><path d="M6.53 9C4.6 8.8 3 7.1 3 5"/><path d="M6 13H2"/><path d="M3 21c0-2.1 1.7-3.9 3.8-4"/><path d="M20.97 5c0 2.1-1.6 3.8-3.5 4"/><path d="M18 13h4"/><path d="M21 21c0-2.1-1.7-3.9-3.8-4"/></svg>');
  background-size: contain;
  background-repeat: no-repeat;
}

.doc-block:hover .bug-link,
.bug-link:focus {
  opacity: 0.4;
}

.bug-link:hover {
  opacity: 1 !important;
}
`;
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
