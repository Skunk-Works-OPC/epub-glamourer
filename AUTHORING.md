# Authoring Guide

Step-by-step recipe for producing a publisher-ready EPUB with epub-glamourer. Follow this exactly and you will get the same result as `reference/model.epub`.

---

## The shape of a book project

A book is just a directory:

```
my-book/
├── metadata.json         (required — title, author, language, …)
├── cover.jpg             (optional — your cover image)
├── chapter-001.md        (chapter source files, sorted by filename)
├── chapter-002.md
├── chapter-003.md
└── images/               (optional — referenced from chapters)
    ├── figure-1.png
    └── figure-2.jpg
```

epub-glamourer reads `metadata.json`, then every file matching `chapter-*.{md,html,txt,docx}` in sorted order, then every image under `images/`, and assembles everything into a valid EPUB3.

You do not need to know anything about OPF, NCX, manifests, or spines. The tool builds all of that.

---

## Step 1 — create the project directory

```bash
mkdir my-book
cd my-book
```

---

## Step 2 — write `metadata.json`

This is the single source of truth for book-level metadata. Place it at the root of the project directory.

```json
{
  "title": "The Title of My Book",
  "author": "Author Name",
  "language": "en",
  "publisher": "Publisher Name",
  "date": "2026",
  "rights": "Copyright © 2026 Author Name. All rights reserved.",
  "description": "A short blurb shown by some reading systems and stores.",
  "subject": "Fiction, Literary"
}
```

### Fields

| Field         | Required | Notes |
|---------------|----------|-------|
| `title`       | yes      | Used on cover, title page, TOC, OPF `<dc:title>` |
| `author`      | yes      | OPF `<dc:creator>` |
| `language`    | yes      | BCP-47 code: `en`, `en-US`, `fr`, `ja`, … |
| `publisher`   | no       | Shown on title page and copyright page |
| `date`        | no       | Publication date — string, free format (`"2026"`, `"2026-05"`, `"May 2026"`) |
| `rights`      | no       | Free-form rights statement on the copyright page |
| `description` | no       | OPF `<dc:description>` |
| `subject`     | no       | OPF `<dc:subject>` (genre/category) |
| `identifier`  | no       | If omitted, a `urn:uuid:…` is auto-generated |

You do **not** put cover image path here — pass it as a CLI flag (Step 4).

---

## Step 3 — write chapters

### Filename rules

- Must match `chapter-*.{md,html,txt,docx}` — for example `chapter-001.md`, `chapter-introduction.md`, `chapter-002-revised.html`.
- Files are sorted by filename, then read in that order. Use zero-padded numbers (`chapter-001`, not `chapter-1`) so 10 doesn't sort before 2.
- One chapter file → one chapter in the spine. The tool renumbers IDs to `chapter-001`, `chapter-002`, … regardless of your source filenames.

### Markdown (recommended)

Standard CommonMark / GitHub-flavoured Markdown. The H1 becomes the chapter title.

```markdown
# The First Day

It was a *cold* morning when Sarah opened the door.

She had not expected the cat to be there.

## A subsection

> A blockquote renders with a gold left border.

Plain paragraphs, **bold**, _italic_, `inline code`, and standard
[links](https://example.com) all work.
```

#### Optional YAML front matter

If you need per-chapter metadata or want metadata co-located with chapter one instead of in `metadata.json`:

```markdown
---
title: My Book
author: Jane Author
lang: en
publisher: Self-published
---

# Chapter One

Story begins…
```

**Precedence**: `metadata.json` always wins over front matter. Front matter fills any blanks `metadata.json` doesn't set.

### HTML / XHTML

If you already have HTML pages, drop them in as `chapter-NNN.html`. The tool strips `<script>` and `<style>`, normalizes to XHTML5, adds missing `alt=""` on images, and wraps the body in `<section epub:type="chapter">`. If a single HTML file contains multiple `<h1>` headings, it will be split into multiple chapters.

### Plain text

Drop a `chapter-NNN.txt` file. Double-newlines become paragraph breaks. Lines matching `CHAPTER`, `Chapter`, `Part`, `Section`, or short Roman numerals start a new chapter inside the file.

### Word documents

Drop a `chapter-NNN.docx`. The tool uses `mammoth` with a style map:

| Word style | Becomes |
|-----------|---------|
| Heading 1 | `<h1>` |
| Heading 2 | `<h2>` |
| Heading 3 | `<h3>` |
| Normal / Body Text | `<p class="story">` |
| Italic / Emphasis (run) | `<em>` |
| Bold / Strong (run) | `<strong>` |
| Block Text / Quotations | `<blockquote>` |

Author your `.docx` using semantic styles (Heading 1, Heading 2, etc.) — not direct formatting — for the best result.

### Mixing formats

Yes — you can mix `chapter-001.md`, `chapter-002.html`, `chapter-003.docx` in the same project. They'll all be normalized to XHTML5 and assembled in filename order.

---

## Step 4 — add a cover image (optional)

Save your cover as `cover.jpg`, `cover.png`, or `cover.svg` somewhere on disk and pass it with `--cover` on build (Step 5). Recommended dimensions: **1600 × 2400 px** (2:3 aspect ratio) or larger.

If you skip this step, the tool auto-generates a navy/gold SVG placeholder showing the title and author. The placeholder is decent, but a real cover is always better.

---

## Step 5 — build

From the **parent** of your book directory:

```bash
node /path/to/epub-glamourer/dist/cli.js my-book/ -c my-book/cover.jpg
```

Or from inside `epub-glamourer/`:

```bash
node dist/cli.js /path/to/my-book/ -c /path/to/my-book/cover.jpg
```

Output: `my-book.epub` next to the source directory.

### Preview before packaging

```bash
node dist/cli.js my-book/ --preview
```

A browser opens at `http://localhost:3456` with the glamour stylesheet applied. Click chapters in the sidebar to browse. Press <kbd>Enter</kbd> in the terminal to dismiss the preview and proceed to packaging.

### Custom output path

```bash
node dist/cli.js my-book/ -o ~/Desktop/My-Book.epub
```

---

## Step 6 — verify

The CLI runs the W3C `epubcheck` automatically (if Java 11+ is installed; otherwise a structural check). You want to see:

```
✓ Done! my-book.epub (NNN KB)
✔ Valid EPUB (epubcheck)
```

Open the file in:
- **Apple Books** (macOS / iPad): drag-and-drop into the Books app
- **Calibre**: drag-and-drop into the library, then open the viewer
- **Kobo / Kindle**: side-load via USB or email

Verify visually:
- Cover image is full-bleed (no border)
- Title page has the gold border, navy title, gold ornament (❧)
- First paragraph of each chapter has a gold drop cap
- Body text is in Lora serif, justified, with hyphenation
- TOC navigates correctly to every chapter
- Page background and margins are controlled by the reader (not by your CSS)

---

## Cheat sheet — minimum viable book

```bash
# Project skeleton
mkdir my-book && cd my-book

cat > metadata.json <<EOF
{ "title": "Untitled", "author": "Anonymous", "language": "en" }
EOF

echo "# Chapter One"$'\n\n'"Once upon a time…" > chapter-001.md

# Build
cd ..
node /path/to/epub-glamourer/dist/cli.js my-book
# → my-book.epub
```

That is the smallest possible book that produces a valid, glamoured EPUB3 with cover, title page, copyright page, landmarks navigation, NCX fallback, embedded Lora fonts, and the full glamour stylesheet.

---

## Tips and pitfalls

### Sort order matters

`chapter-1.md`, `chapter-10.md`, `chapter-2.md` will sort as 1, 10, 2 — almost certainly not what you want. **Always zero-pad**: `chapter-001`, `chapter-002`, …, `chapter-010`.

### Front-matter precedence

`metadata.json` always overrides chapter front matter. If you change the author in `metadata.json`, you don't need to update each chapter's front matter — but stale front matter values are silently ignored, which can be confusing later. Pick one source and stick to it.

### Images

Reference images from chapters using a relative path that matches the project layout:

```markdown
![A diagram](images/diagram.png)
```

epub-glamourer will copy `my-book/images/diagram.png` into `OEBPS/images/diagram.png` inside the EPUB and adjust nothing else. The `src` attribute in the rendered XHTML stays as `images/diagram.png`, which resolves correctly because the chapter XHTML lives next to the `images/` directory inside `OEBPS/`.

### Title page

The title page is auto-generated from `metadata.json` (title, author, publisher, date). There is no `title-page.md` source file. If you want a custom title page, the cleanest workaround is to skip the auto-generated one and instead make your `chapter-001.md` *be* the title page — but the current build pipeline always inserts cover → title-page → copyright → toc → chapters in that order, so a fully custom title page would require a code change.

### Re-skinning vs. building

`epub-glamour mybook.epub` re-skins an existing EPUB by injecting `main.css` and Lora fonts into its OPF and `<head>` tags. It does **not** rewrite the existing content structure. If your input EPUB has no cover or a broken TOC, the re-skinned output will too. To get a properly structured book, build from source (the primary path), don't re-skin a malformed EPUB.

### CSS modifications

If you want to change the look (colours, fonts, drop-cap size, etc.), edit `assets/main.css`. The five design tokens at the top (`--cream`, `--ink`, `--navy`, `--gold`, `--sage`) are the easiest places to start. Keep these constraints:

- Do **not** set `background-color`, `max-width`, `margin`, or `padding` on `<body>`. Reading systems own page chrome — fighting them produces a visible "card" floating inside the reader's page (the bug we fixed during initial development).
- Do **not** use flexbox or CSS Grid in content styles. Use `float`, `display: block`, or `table` layouts for Kindle / Kobo compatibility.
- Keep `var(--token, fallback)` syntax — older Kindle firmware ignores CSS custom properties, so the fallback is what they actually render.

After editing `main.css`, rebuild any book to see the change: the build pipeline reads the stylesheet fresh from disk each time.

---

## What the tool guarantees

Every EPUB produced by `epub-glamourer build` has, structurally:

- `mimetype` as the first ZIP entry, uncompressed (STORE), value `application/epub+zip`
- `META-INF/container.xml` pointing to `OEBPS/content.opf`
- `OEBPS/content.opf` with EPUB3 namespaces, DC metadata (title, creator, language, identifier, dcterms:modified), manifest, and spine
- `OEBPS/toc.xhtml` with two navs: `epub:type="toc"` AND `epub:type="landmarks"` (cover, toc, bodymatter)
- `OEBPS/toc.ncx` legacy NCX for EPUB2 reading systems
- `OEBPS/cover.xhtml` first in spine with `linear="no"`, marked `epub:type="cover"`
- `OEBPS/title-page.xhtml` with `epub:type="titlepage"`
- `OEBPS/copyright.xhtml` with `epub:type="copyright-page"`
- `OEBPS/main.css` glamour stylesheet linked from every XHTML
- `OEBPS/fonts/Lora-Regular.ttf` and `Lora-Italic.ttf` embedded
- All `<img>` tags have `alt` attributes (accessibility requirement)
- All `id` attributes are valid XML NCNames

The output passes `epubcheck` v5.1.0 with zero errors when built from a well-formed source directory.
