# epub-glamourer

A Node.js / TypeScript CLI that builds publisher-ready EPUB3 files from a directory of chapters, or re-skins existing EPUBs with a typographic "glamour" stylesheet (Lora serif, navy headings, gold drop caps, ornamental title page).

The output passes the W3C `epubcheck` validator with zero errors and renders correctly in Apple Books, Calibre, Kobo, and Kindle.

---

## What it does

- **Primary — build new EPUBs**: point at a directory of `chapter-NNN.md` (or `.html` / `.txt` / `.docx`) files plus a `metadata.json`, and out comes a fully-structured EPUB3 with cover, title page, copyright page, landmarks navigation, NCX fallback, and the glamour stylesheet baked in.
- **Secondary — re-skin existing EPUBs**: unpack any EPUB, inject the glamour CSS + Lora fonts, update the OPF manifest, and repack — without touching the original content.

### Structural guarantees

Every EPUB produced has, in spine order:

1. `cover.xhtml` with `epub:type="cover"`, `linear="no"` so it doesn't enter pagination
2. `title-page.xhtml` with `epub:type="titlepage"`
3. `copyright.xhtml` with `epub:type="copyright-page"`
4. `toc.xhtml` with **two** navs: `epub:type="toc"` (readable TOC) **and** `epub:type="landmarks"` (cover / toc / bodymatter)
5. `toc.ncx` legacy fallback for EPUB2 reading systems
6. `chapter-NNN.xhtml` body chapters with `epub:type="chapter"`

The cover image and Lora TTF fonts are embedded; `mimetype` is the first ZIP entry, uncompressed (STORE), as required by the spec.

---

## Install

```bash
git clone <repo-url>
cd epub-glamourer
npm install
npm run build
```

Optional: install Java 11+ to enable full `epubcheck` validation. Without Java the CLI falls back to a built-in structural validator. The first run downloads `epubcheck` to `~/.epub-glamourer/`.

---

## Quickstart — build your first EPUB in 60 seconds

```bash
# 1. Make a project folder
mkdir my-book && cd my-book

# 2. Add a metadata file
cat > metadata.json <<'EOF'
{
  "title": "My First Book",
  "author": "Jane Author",
  "language": "en",
  "publisher": "Self-published",
  "date": "2026"
}
EOF

# 3. Write chapters (any number, sorted by filename)
echo "# Chapter One" > chapter-001.md
echo "This is where the story begins." >> chapter-001.md

echo "# Chapter Two" > chapter-002.md
echo "And here it continues." >> chapter-002.md

# 4. Build
cd ..
node dist/cli.js my-book

# Output: my-book.epub
```

Open `my-book.epub` in Apple Books / Calibre — done.

For the full authoring reference (cover images, metadata fields, front matter, mixed formats, preview server), see [AUTHORING.md](AUTHORING.md).

---

## CLI

```
epub-glamour <input> [options]

  <input>                  Directory of chapters, single source file, or .epub

  -o, --output <path>      Output path (default: <input>.epub or <input>-glamoured.epub)
  -c, --cover <path>       Cover image (JPG/PNG/SVG). Otherwise tries OpenLibrary, then SVG.
      --no-online-cover    Skip OpenLibrary cover lookup (always use SVG fallback)
  -p, --preview            Open HTML preview in browser before packaging
      --preview-port <n>   Preview server port (default 3456)
      --no-validate        Skip epubcheck / structural validation
      --keep-css           Re-skin only: don't suppress original stylesheets
      --strip-pg           Re-skin only: hide Project Gutenberg boilerplate
  -v, --verbose            Verbose logging
```

Examples:

```bash
epub-glamour my-book/                          # build from chapter directory
epub-glamour my-book/ -c cover.jpg             # with your own cover
epub-glamour my-book/ --preview                # preview in browser first
epub-glamour manuscript.docx                   # build from a single Word doc
epub-glamour old-book.epub                     # re-skin existing EPUB
```

---

## Reference EPUB

`reference/model.epub` is a 228 KB publisher-ready EPUB3 that doubles as the integration test fixture. It is built by the same CLI from `reference/src/`:

```bash
npm run build:model
# or, equivalently:
node dist/cli.js reference/src -o reference/model.epub
```

Open it in Apple Books to see what a finished glamoured book looks like.

---

## Project structure

```
epub-glamourer/
├── src/
│   ├── cli.ts              CLI entry (commander + ora + chalk)
│   ├── router.ts           Detects format, dispatches build vs. re-skin
│   ├── glamourer.ts        Core: CSS/font injection + OPF mutation
│   ├── unpacker.ts         EPUB ZIP extraction + OPF parsing
│   ├── packer.ts           EPUB ZIP packing (mimetype STORE first)
│   ├── normalizer.ts       XHTML5 normalization via cheerio
│   ├── previewer.ts        Express HTML preview server
│   ├── validator.ts        epubcheck bridge + structural fallback
│   ├── metadata.ts         UUID generation, metadata helpers
│   ├── extractors/
│   │   ├── directory.ts    Multi-chapter folder + metadata.json (primary)
│   │   ├── markdown.ts     marked + YAML front matter
│   │   ├── html.ts         cheerio normalization
│   │   ├── txt.ts          Plain text → paragraph-wrapped XHTML
│   │   ├── docx.ts         mammoth with semantic style map
│   │   └── pdf.ts          pdf-parse text extraction
│   └── builders/
│       ├── opf.ts          content.opf builder/mutator
│       ├── nav.ts          toc.xhtml with toc + landmarks navs
│       ├── ncx.ts          Legacy toc.ncx for EPUB2 fallback
│       └── cover.ts        SVG cover generator + XHTML wrapper
├── assets/
│   ├── main.css            Glamour stylesheet
│   └── fonts/              Lora-Regular.ttf, Lora-Italic.ttf
├── templates/              Handlebars templates (cover/title/copyright/chapter)
├── reference/
│   ├── model.epub          Reference EPUB built by this project
│   └── src/                Source markdown + metadata for model.epub
└── tests/                  40 unit + integration tests
```

---

## Stylesheet philosophy

`assets/main.css` styles only **content** — typography, drop caps, headings, ornaments, decorative borders on the title page. It deliberately does **not** style `<body>` width or background, because reading systems own the page chrome (page size, margins, light/sepia/dark themes). Setting `body { background-color, max-width, margin }` makes the body render as a centered "card" floating inside the reader's own page — which looks broken in Apple Books and Kindle. The current CSS avoids this trap.

The palette uses CSS custom properties with explicit fallbacks for older Kindle firmware:

```
--cream  #faf7f2   page-feeling warm white (used on title-page borders, banners)
--ink    #1c1c1e   body text (soft black)
--navy   #1e3a5f   headings, links
--gold   #b8924a   drop caps, dividers, title-page border
--sage   #4a6741   secondary accent
--muted  #6b6b6b   captions, copyright text
```

No flexbox or CSS Grid is used in body content — drop caps use `float: left`, mobile illustration stacks use `display: block` — for maximum compatibility with e-ink readers.

---

## Tests

```bash
npm test                       # all 40 tests
npm run test:integration       # integration only (build + roundtrip)
```

Integration tests build a real EPUB from `reference/src/`, validate it structurally, verify spine order, manifest entries, landmarks, cover override, and metadata propagation.
