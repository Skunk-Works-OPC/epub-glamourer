# Authoring Guide

Step-by-step recipe for producing a publisher-ready EPUB with epub-glamourer. Follow this exactly and you will get the same result as `reference/model.epub`.

For the **semi-auto "drop a file" workflow** where the Claude agent handles metadata and structure for you, see the [Semi-auto workflow](#semi-auto-workflow-drop-a-file-and-let-the-agent-do-the-rest) section at the end of this guide.

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

---

## Semi-auto workflow — drop a file and let the agent do the rest

For one-off conversions where you don't want to hand-author a `metadata.json` + chapter directory, work conversationally with the Claude agent. The agent runs the CLI, reads the extracted content, proposes metadata, fetches a cover, and builds the EPUB. You confirm or correct along the way.

### Cover image priority

When building a new EPUB, covers are resolved in this order:

1. **`--cover <path>`** — if you provide one, it wins, no questions asked
2. **OpenLibrary lookup** — once title + author are known, the pipeline queries `https://openlibrary.org/search.json?title=…&author=…`, finds a matching book with a `cover_i`, and downloads the large cover JPEG from `https://covers.openlibrary.org/`. No API key required.
3. **Generated SVG** — if 1 and 2 both fail (no `--cover`, no OpenLibrary match, network down), falls back to the navy/gold SVG placeholder with the book's title and author rendered on it.

Pass `--no-online-cover` to skip step 2 (useful offline or for unpublished work where you want the SVG placeholder regardless).

### Chat protocol

Tell the agent something like:

> "Drop this and build me an EPUB: `/path/to/my-file.pdf`"
>
> "Make an epub out of this `.docx` file at `~/Downloads/draft.docx`. It's my own writing."
>
> "Convert this Project Gutenberg book to a glamoured EPUB: `~/Downloads/pg1342.txt`"

The agent will then:

1. **Inspect the file** — read the first portion of content, plus any metadata embedded in the file (PDF `info` dict, DOCX core props, EPUB OPF, etc.)
2. **Propose full metadata** — title, author, language, publisher, date, rights, subject. For unknown books the agent uses its own knowledge (e.g. it knows Pride and Prejudice was written by Jane Austen in 1813). For your own drafts it'll ask you for the basics.
3. **Confirm with you** — show you the proposed metadata. You say "yes" or "change the title to X" or "set publisher to Y."
4. **Choose a cover strategy**:
   - "I'll provide a cover" → you give a path, agent uses `--cover`
   - "Try OpenLibrary" (default for known books) → agent runs without `--cover`, the pipeline auto-fetches
   - "Generate SVG" (default for unpublished work) → agent passes `--no-online-cover`
5. **Build** — agent runs `node dist/cli.js <input> -o <output> [options]`, watches `epubcheck` validation, reports the result.
6. **Iterate** — if anything looks off (wrong cover, garbled chapters from PDF, weird title page), say so and the agent re-runs with adjustments.

### Worked examples

**Existing published book (real metadata available):**

> You: "Convert `~/Downloads/austen-pride-and-prejudice.pdf` please"
>
> Agent: "Extracting… the PDF text shows this is *Pride and Prejudice* by Jane Austen. I'll set:
> - title: Pride and Prejudice
> - author: Jane Austen
> - language: en
> - publisher: T. Egerton, Whitehall (1813)
> - rights: Public domain
>
> Cover: OpenLibrary will find a real one. OK to build?"
>
> You: "Yes."
>
> Agent: *runs CLI, reports "✓ Done! Pride-and-Prejudice.epub (1.2 MB) — Valid EPUB (epubcheck)"*

**Public-domain text (Project Gutenberg):**

> You: "Make an EPUB from `~/Downloads/pg11.txt`" *(Gutenberg's Alice in Wonderland)*
>
> Agent: "The file header identifies this as 'Alice's Adventures in Wonderland' by Lewis Carroll, from Project Gutenberg. I'll strip the PG license header/footer using `--strip-pg` and set up metadata accordingly. OpenLibrary should find the cover. OK?"

**Your own draft (no external metadata):**

> You: "Convert my draft at `~/writing/novel-v3.docx`"
>
> Agent: "This looks like an in-progress draft — no title page detected, no recognized author. I need to ask:
> - What's the book's title?
> - Who's the author?
> - Language? (defaulting to English)
> - Do you have a cover image, or should I generate the SVG placeholder?"

**Random unknown PDF:**

> You: "Build something from `~/Downloads/random-doc.pdf`"
>
> Agent: "The first page reads… *[summarises]*. The PDF has no title metadata. Looks like a technical manual on widget assembly. Should I title it 'Widget Assembly Guide' or do you have a real title? Author/publisher unknown — what should I set?"

### What the agent will never silently do

- Invent a publisher or copyright date for unpublished work — those stay blank or get a sensible default like "Self-published" only after you confirm.
- Use OpenLibrary covers for *your own* unpublished work (would be wrong).
- Skip cover entirely — every EPUB has a cover, either yours, OpenLibrary's, or the generated SVG.
- Discard chapters silently — if the extractor produces zero chapters from a PDF, the agent will say so and ask before falling back to "one chapter containing everything."

### Equivalent manual command

If you want to skip the chat and run it yourself, the agent is just calling:

```bash
# Existing published book — let OpenLibrary find the cover
node dist/cli.js ~/Downloads/some-book.pdf -o ~/Desktop/SomeBook.epub

# Your own draft — generate SVG, skip OpenLibrary
node dist/cli.js ~/writing/draft.docx --no-online-cover -c ~/writing/my-cover.jpg

# Project Gutenberg text
node dist/cli.js ~/Downloads/pg1342.txt --strip-pg
```

The chat workflow is just a wrapper that makes metadata decisions visible and reversible before they go into the EPUB.
