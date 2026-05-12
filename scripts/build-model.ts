#!/usr/bin/env ts-node
/**
 * Build the reference/model.epub from reference/src/ source files.
 * This script bypasses the single-file extractor to assemble multiple
 * markdown chapters with shared metadata.
 */
import * as path from 'path';
import * as fs from 'fs-extra';
import { marked } from 'marked';
import { pack, buildMimetype, buildContainerXml } from '../src/packer';
import { buildOpf } from '../src/builders/opf';
import { buildNav } from '../src/builders/nav';
import { buildNcx } from '../src/builders/ncx';
import { buildCoverXhtml, buildCoverSvg } from '../src/builders/cover';
import { buildMetadata, generateIdentifier } from '../src/metadata';
import type { EpubPackage, ManifestItem, SpineItem } from '../src/types/epub';
import type { ExtractedChapter } from '../src/types/pipeline';

const SRC_DIR = path.join(__dirname, '..', 'reference', 'src');
const OUTPUT = path.join(__dirname, '..', 'reference', 'model.epub');
const OPF_PATH = 'OEBPS/content.opf';
const OPF_DIR = 'OEBPS';

async function main(): Promise<void> {
  console.log('Building reference/model.epub...');

  const metaJson = await fs.readJson(path.join(SRC_DIR, 'metadata.json')) as Record<string, string>;
  const metadata = buildMetadata({
    ...metaJson,
    identifier: generateIdentifier(),
  });

  // Read and parse chapter markdown files in order
  const mdFiles = (await fs.readdir(SRC_DIR))
    .filter((f) => f.startsWith('chapter-') && f.endsWith('.md'))
    .sort();

  const chapters: Array<{ id: string; filename: string; title: string; xhtmlContent: string; epubType: string }> = [];

  for (const mdFile of mdFiles) {
    const raw = await fs.readFile(path.join(SRC_DIR, mdFile), 'utf8');
    const content = stripFrontMatter(raw);
    const html = await marked.parse(content);
    const title = extractTitle(html) ?? path.basename(mdFile, '.md');
    const id = path.basename(mdFile, '.md');
    const filename = `${id}.xhtml`;

    const xhtmlContent = `<?xml version='1.0' encoding='UTF-8'?>
<html xmlns="http://www.w3.org/1999/xhtml"
      xmlns:epub="http://www.idpf.org/2007/ops"
      xml:lang="${metadata.language}">
<head>
  <meta charset="utf-8"/>
  <title>${escapeXml(title)}</title>
  <link href="main.css" rel="stylesheet" type="text/css"/>
</head>
<body>
  <section epub:type="chapter">
    ${html}
  </section>
</body>
</html>`;

    chapters.push({ id, filename, title, xhtmlContent, epubType: 'chapter' });
  }

  const files = new Map<string, Buffer>();

  // EPUB skeleton
  files.set('mimetype', buildMimetype());
  files.set('META-INF/container.xml', buildContainerXml(OPF_PATH));

  // Cover
  const coverSvg = buildCoverSvg(metadata.title, metadata.author);
  files.set(`${OPF_DIR}/images/cover.svg`, coverSvg);
  const coverXhtml = buildCoverXhtml('images/cover.svg', metadata.title, metadata.language);
  files.set(`${OPF_DIR}/cover.xhtml`, Buffer.from(coverXhtml, 'utf8'));

  // Title page
  files.set(`${OPF_DIR}/title-page.xhtml`, Buffer.from(buildTitlePage(metadata), 'utf8'));

  // Copyright page
  files.set(`${OPF_DIR}/copyright.xhtml`, Buffer.from(buildCopyrightPage(metadata), 'utf8'));

  // Chapters
  for (const ch of chapters) {
    files.set(`${OPF_DIR}/${ch.filename}`, Buffer.from(ch.xhtmlContent, 'utf8'));
  }

  // Glamour assets
  const assetsDir = path.join(__dirname, '..', 'assets');
  files.set(`${OPF_DIR}/main.css`, await fs.readFile(path.join(assetsDir, 'main.css')));
  files.set(`${OPF_DIR}/fonts/Lora-Regular.ttf`, await fs.readFile(path.join(assetsDir, 'fonts', 'Lora-Regular.ttf')));
  files.set(`${OPF_DIR}/fonts/Lora-Italic.ttf`, await fs.readFile(path.join(assetsDir, 'fonts', 'Lora-Italic.ttf')));

  // All pages in spine order
  const allPages: Array<{ id: string; filename: string; title: string; epubType: string }> = [
    { id: 'cover', filename: 'cover.xhtml', title: 'Cover', epubType: 'cover' },
    { id: 'title-page', filename: 'title-page.xhtml', title: 'Title Page', epubType: 'titlepage' },
    { id: 'copyright', filename: 'copyright.xhtml', title: 'Copyright', epubType: 'copyright-page' },
    { id: 'toc-nav', filename: 'toc.xhtml', title: 'Table of Contents', epubType: 'toc' },
    ...chapters,
  ];

  // Nav
  const navXhtml = buildNav(allPages, metadata.title, metadata.language, 'cover.xhtml');
  files.set(`${OPF_DIR}/toc.xhtml`, Buffer.from(navXhtml, 'utf8'));

  // NCX
  const ncxXml = buildNcx(
    allPages as Parameters<typeof buildNcx>[0],
    metadata.title,
    metadata.identifier,
    metadata.author
  );
  files.set(`${OPF_DIR}/toc.ncx`, Buffer.from(ncxXml, 'utf8'));

  // Manifest
  const manifest: ManifestItem[] = [
    { id: 'glamour-main-css', href: 'main.css', mediaType: 'text/css' },
    { id: 'glamour-font-lora-regular', href: 'fonts/Lora-Regular.ttf', mediaType: 'application/font-sfnt' },
    { id: 'glamour-font-lora-italic', href: 'fonts/Lora-Italic.ttf', mediaType: 'application/font-sfnt' },
    { id: 'ncx', href: 'toc.ncx', mediaType: 'application/x-dtbncx+xml' },
    { id: 'toc-nav', href: 'toc.xhtml', mediaType: 'application/xhtml+xml', properties: 'nav' },
    { id: 'cover-image', href: 'images/cover.svg', mediaType: 'image/svg+xml', properties: 'cover-image' },
    { id: 'cover', href: 'cover.xhtml', mediaType: 'application/xhtml+xml' },
    { id: 'title-page', href: 'title-page.xhtml', mediaType: 'application/xhtml+xml' },
    { id: 'copyright', href: 'copyright.xhtml', mediaType: 'application/xhtml+xml' },
    ...chapters.map((ch) => ({
      id: ch.id,
      href: ch.filename,
      mediaType: 'application/xhtml+xml' as const,
    })),
  ];

  // Spine
  const spine: SpineItem[] = [
    { idref: 'cover', linear: 'no' },
    { idref: 'title-page' },
    { idref: 'copyright' },
    { idref: 'toc-nav' },
    ...chapters.map((ch) => ({ idref: ch.id })),
  ];

  const epubPackage: EpubPackage = {
    metadata,
    manifest,
    spine,
    opfPath: OPF_PATH,
    opfDir: OPF_DIR,
  };

  const opfXml = buildOpf(epubPackage);
  files.set(OPF_PATH, Buffer.from(opfXml, 'utf8'));

  await fs.ensureDir(path.dirname(OUTPUT));
  await pack(files, OUTPUT);

  const stat = await fs.stat(OUTPUT);
  console.log(`✓ Built ${OUTPUT} (${(stat.size / 1024).toFixed(1)} KB)`);
  console.log(`  Spine: cover → title-page → copyright → toc → ${chapters.map((c) => c.id).join(' → ')}`);
}

function stripFrontMatter(raw: string): string {
  return raw.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, '');
}

function extractTitle(html: string): string | null {
  const m = html.match(/<h[123][^>]*>(.*?)<\/h[123]>/i);
  return m ? m[1].replace(/<[^>]+>/g, '').trim() : null;
}

function escapeXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function buildTitlePage(meta: ReturnType<typeof buildMetadata>): string {
  const e = escapeXml;
  return `<?xml version='1.0' encoding='UTF-8'?>
<html xmlns="http://www.w3.org/1999/xhtml"
      xmlns:epub="http://www.idpf.org/2007/ops"
      xml:lang="${meta.language}">
<head>
  <meta charset="utf-8"/>
  <title>${e(meta.title)}</title>
  <link href="main.css" rel="stylesheet" type="text/css"/>
</head>
<body>
  <section epub:type="titlepage">
    <div class="title-page">
      <span class="ornament">&#10087;</span>
      <p class="book-title">${e(meta.title)}</p>
      <p class="book-author">${e(meta.author)}</p>
      ${meta.publisher ? `<p class="book-publisher">${e(meta.publisher)}</p>` : ''}
      ${meta.date ? `<p class="book-publisher">${e(meta.date)}</p>` : ''}
    </div>
  </section>
</body>
</html>`;
}

function buildCopyrightPage(meta: ReturnType<typeof buildMetadata>): string {
  const e = escapeXml;
  return `<?xml version='1.0' encoding='UTF-8'?>
<html xmlns="http://www.w3.org/1999/xhtml"
      xmlns:epub="http://www.idpf.org/2007/ops"
      xml:lang="${meta.language}">
<head>
  <meta charset="utf-8"/>
  <title>Copyright</title>
  <link href="main.css" rel="stylesheet" type="text/css"/>
</head>
<body>
  <section epub:type="copyright-page">
    <div class="copyright-page">
      <p><em>${e(meta.title)}</em></p>
      <p>By ${e(meta.author)}</p>
      ${meta.rights ? `<p>${e(meta.rights)}</p>` : ''}
      ${meta.publisher ? `<p>Published by ${e(meta.publisher)}</p>` : ''}
      ${meta.date ? `<p>${e(meta.date)}</p>` : ''}
      <p>ID: ${e(meta.identifier)}</p>
    </div>
  </section>
</body>
</html>`;
}

main().catch((err) => {
  console.error('Build failed:', err);
  process.exit(1);
});
