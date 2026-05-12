# Structure and Standards

A publisher-ready EPUB3 file is more than a collection of HTML pages in a ZIP archive. It is a precisely structured publication with required components, mandatory metadata, and a well-defined reading order.

## The EPUB3 Spine

The spine defines the default reading order of the publication. For the glamour model, the spine follows this sequence:

1. **Cover** (`epub:type="cover"`, `linear="no"`) — the cover image page, marked non-linear so reading systems may display it as a thumbnail without including it in page count
2. **Title Page** (`epub:type="titlepage"`) — book title, author, and publisher with decorative treatment
3. **Copyright** (`epub:type="copyright-page"`) — rights statement and publication details
4. **Table of Contents** — the EPUB3 navigation document, which doubles as a readable TOC chapter
5. **Body Chapters** (`epub:type="chapter"`) — the main content in reading order

## Navigation and Landmarks

The EPUB3 navigation document (`toc.xhtml`) contains two navigation structures:

The **table of contents** (`epub:type="toc"`) provides the chapter list familiar to readers. Reading systems render this as the navigable TOC panel.

The **landmarks** (`epub:type="landmarks"`) list is less visible to readers but critical for accessibility and reading system interoperability. It designates the canonical entry points:

- *Cover* landmark — where the cover image lives
- *Table of contents* landmark — the navigation document itself  
- *Begin reading* landmark — the first body chapter

These landmarks allow screen readers and accessibility tools to navigate directly to key sections, and allow reading systems to offer features like "go to beginning" reliably.

## Validation

A publication is only publisher-ready when it passes EPUB validation. The epub-glamourer toolchain runs `epubcheck` — the W3C's official EPUB validator — as the final step. Zero errors is the standard. Warnings are reviewed but do not block publication.
