import * as path from 'path';
import * as fs from 'fs-extra';
import Handlebars from 'handlebars';
import { unpack } from './unpacker.js';
import { pack, buildMimetype, buildContainerXml } from './packer.js';
import { glamourFiles } from './glamourer.js';
import { getExtractor } from './extractors/index.js';
import { extractDirectory, isDirectoryInput } from './extractors/directory.js';
import { buildMetadata } from './metadata.js';
import { buildOpf } from './builders/opf.js';
import { buildNav } from './builders/nav.js';
import { buildNcx } from './builders/ncx.js';
import { buildCoverXhtml, buildCoverSvg } from './builders/cover.js';
import { fetchCoverFromOpenLibrary } from './covers/openlibrary.js';
import { mediaTypeFromExtension } from './types/epub.js';
import type { GlamourOptions, ExtractResult } from './types/pipeline.js';
import type { EpubPackage, ManifestItem, SpineItem } from './types/epub.js';

const TEMPLATES_DIR = path.join(__dirname, '..', 'templates');

async function renderTemplate(name: string, context: Record<string, unknown>): Promise<string> {
  const src = await fs.readFile(path.join(TEMPLATES_DIR, name), 'utf8');
  return Handlebars.compile(src)(context);
}

const OPF_PATH = 'OEBPS/content.opf';
const OPF_DIR = 'OEBPS';

export async function run(inputPath: string, opts: GlamourOptions): Promise<string> {
  // Primary: build from a directory of chapters
  if (await isDirectoryInput(inputPath)) {
    const result = await extractDirectory(inputPath, opts);
    return buildEpubFromExtraction(result, inputPath, opts);
  }

  const ext = path.extname(inputPath).toLowerCase();

  // Primary: build from a single source file
  if (ext !== '.epub') {
    const extractor = getExtractor(inputPath);
    if (!extractor) throw new Error(`Unsupported input format: ${ext}`);
    const result = await extractor(inputPath, opts);
    return buildEpubFromExtraction(result, inputPath, opts);
  }

  // Secondary: re-skin an existing EPUB
  return runReskinPipeline(inputPath, opts);
}

async function runReskinPipeline(inputPath: string, opts: GlamourOptions): Promise<string> {
  const { epubPackage, files } = await unpack(inputPath);
  const { files: glamouredFiles } = await glamourFiles(files, epubPackage, opts);

  const outputPath = opts.outputPath ?? deriveOutputPath(inputPath);
  await pack(glamouredFiles, outputPath);
  return outputPath;
}

async function buildEpubFromExtraction(
  extracted: ExtractResult,
  inputPath: string,
  opts: GlamourOptions
): Promise<string> {
  const { chapters, metadata: extractedMeta, images } = extracted;
  const metadata = buildMetadata(extractedMeta);

  const files = new Map<string, Buffer>();

  files.set('mimetype', buildMimetype());
  files.set('META-INF/container.xml', buildContainerXml(OPF_PATH));

  // Cover image — priority: user-provided > OpenLibrary lookup > generated SVG
  const { filename: coverImageFilename, mediaType: coverMediaType, buffer: coverBuffer } =
    await resolveCoverImage(opts.coverPath, metadata.title, metadata.author, opts);
  files.set(`${OPF_DIR}/images/${coverImageFilename}`, coverBuffer);

  files.set(
    `${OPF_DIR}/cover.xhtml`,
    Buffer.from(buildCoverXhtml(`images/${coverImageFilename}`, metadata.title, metadata.language), 'utf8')
  );

  files.set(`${OPF_DIR}/title-page.xhtml`, Buffer.from(buildTitlePageXhtml(metadata), 'utf8'));
  files.set(`${OPF_DIR}/copyright.xhtml`, Buffer.from(buildCopyrightXhtml(metadata), 'utf8'));

  // eStorya Classics back-matter pages (optional)
  const editionYear = String(new Date().getFullYear());
  const templateCtx = { author: metadata.author, year: editionYear, language: metadata.language };
  if (opts.eStoryaClassics) {
    files.set(`${OPF_DIR}/estorya-classics.xhtml`,
      Buffer.from(await renderTemplate('estorya-classics.xhtml.hbs', templateCtx), 'utf8'));
    files.set(`${OPF_DIR}/rights-attribution.xhtml`,
      Buffer.from(await renderTemplate('rights-attribution.xhtml.hbs', templateCtx), 'utf8'));
  }

  for (const chapter of chapters) {
    const withCss = injectLink(chapter.xhtmlContent, 'main.css');
    files.set(`${OPF_DIR}/${chapter.filename}`, Buffer.from(withCss, 'utf8'));
  }

  for (const [filename, buf] of images) {
    files.set(`${OPF_DIR}/images/${filename}`, buf);
  }

  // Glamour assets
  const assetsDir = path.join(__dirname, '..', 'assets');
  files.set(`${OPF_DIR}/main.css`, await fs.readFile(path.join(assetsDir, 'main.css')));
  files.set(`${OPF_DIR}/fonts/Lora-Regular.ttf`, await fs.readFile(path.join(assetsDir, 'fonts', 'Lora-Regular.ttf')));
  files.set(`${OPF_DIR}/fonts/Lora-Italic.ttf`, await fs.readFile(path.join(assetsDir, 'fonts', 'Lora-Italic.ttf')));

  const allPages = [
    { id: 'cover', filename: 'cover.xhtml', title: 'Cover', epubType: 'cover' },
    { id: 'title-page', filename: 'title-page.xhtml', title: 'Title Page', epubType: 'titlepage' },
    { id: 'copyright', filename: 'copyright.xhtml', title: 'Copyright', epubType: 'copyright-page' },
    { id: 'toc-nav', filename: 'toc.xhtml', title: 'Table of Contents', epubType: 'toc' },
    ...chapters.map((c) => ({ id: c.id, filename: c.filename, title: c.title, epubType: 'chapter' })),
    ...(opts.eStoryaClassics ? [
      { id: 'estorya-classics', filename: 'estorya-classics.xhtml', title: 'eStorya Classics Edition', epubType: 'backmatter' },
      { id: 'rights-attribution', filename: 'rights-attribution.xhtml', title: 'Rights & Attribution', epubType: 'backmatter' },
    ] : []),
  ];

  const navXhtml = buildNav(allPages, metadata.title, metadata.language, 'cover.xhtml');
  files.set(`${OPF_DIR}/toc.xhtml`, Buffer.from(navXhtml, 'utf8'));

  const ncxXml = buildNcx(allPages, metadata.title, metadata.identifier, metadata.author);
  files.set(`${OPF_DIR}/toc.ncx`, Buffer.from(ncxXml, 'utf8'));

  const manifest = buildManifest(allPages, chapters, images, coverImageFilename, coverMediaType);
  const spine = buildSpine(allPages, extracted.isPictureBook ?? false);

  const epubPackage: EpubPackage = { metadata, manifest, spine, opfPath: OPF_PATH, opfDir: OPF_DIR };
  const opfXml = buildOpf(epubPackage);
  files.set(OPF_PATH, Buffer.from(opfXml, 'utf8'));

  const outputPath = opts.outputPath ?? deriveOutputPath(inputPath);
  await pack(files, outputPath);
  return outputPath;
}

async function resolveCoverImage(
  coverPath: string | undefined,
  title: string,
  author: string,
  opts: GlamourOptions
): Promise<{ filename: string; mediaType: string; buffer: Buffer }> {
  // 1. User-provided cover wins
  if (coverPath && await fs.pathExists(coverPath)) {
    const ext = path.extname(coverPath).toLowerCase();
    return {
      filename: `cover${ext}`,
      mediaType: mediaTypeFromExtension(ext),
      buffer: await fs.readFile(coverPath),
    };
  }

  // 2. Try OpenLibrary lookup (unless disabled)
  if (opts.onlineCoverLookup) {
    const lookup = await fetchCoverFromOpenLibrary(title, author, { verbose: opts.verbose });
    if (lookup) {
      if (opts.verbose) process.stderr.write(`[cover] using OpenLibrary cover ${lookup.coverId}\n`);
      return { filename: 'cover.jpg', mediaType: 'image/jpeg', buffer: lookup.buffer };
    }
  }

  // 3. Fall back to generated SVG placeholder
  return { filename: 'cover.svg', mediaType: 'image/svg+xml', buffer: buildCoverSvg(title, author) };
}

function buildManifest(
  allPages: Array<{ id: string; filename: string; epubType?: string }>,
  _bodyChapters: Array<{ id: string; filename: string }>,
  images: Map<string, Buffer>,
  coverImageFilename: string,
  coverMediaType: string
): ManifestItem[] {
  // Fixed assets — always present
  const items: ManifestItem[] = [
    { id: 'glamour-main-css', href: 'main.css', mediaType: 'text/css' },
    { id: 'glamour-font-lora-regular', href: 'fonts/Lora-Regular.ttf', mediaType: 'application/font-sfnt' },
    { id: 'glamour-font-lora-italic', href: 'fonts/Lora-Italic.ttf', mediaType: 'application/font-sfnt' },
    { id: 'ncx', href: 'toc.ncx', mediaType: 'application/x-dtbncx+xml' },
    { id: 'cover-image', href: `images/${coverImageFilename}`, mediaType: coverMediaType, properties: 'cover-image' },
  ];

  // All XHTML pages — driven by allPages so any future additions are automatic
  for (const page of allPages) {
    const item: ManifestItem = { id: page.id, href: page.filename, mediaType: 'application/xhtml+xml' };
    if (page.epubType === 'toc') item.properties = 'nav';
    items.push(item);
  }

  // Inline images
  let imgIndex = 0;
  for (const [filename] of images) {
    if (filename === coverImageFilename) continue;
    const ext = path.extname(filename).toLowerCase();
    items.push({
      id: `img-${imgIndex++}`,
      href: `images/${filename}`,
      mediaType: mediaTypeFromExtension(ext),
    });
  }

  return items;
}

function buildSpine(allPages: Array<{ id: string; epubType?: string }>, isPictureBook = false): SpineItem[] {
  return allPages.map((p) => {
    const hiddenInFlow = p.epubType === 'cover' || (isPictureBook && p.epubType === 'toc');
    return {
      idref: p.id,
      linear: hiddenInFlow ? ('no' as const) : undefined,
    };
  });
}

function injectLink(xhtml: string, cssHref: string): string {
  if (xhtml.includes(`href="${cssHref}"`)) return xhtml;
  return xhtml.replace('</head>', `  <link href="${cssHref}" rel="stylesheet" type="text/css"/>\n</head>`);
}

function buildTitlePageXhtml(meta: import('./types/epub.js').EpubMetadata): string {
  const e = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
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

function buildCopyrightXhtml(meta: import('./types/epub.js').EpubMetadata): string {
  const e = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const rights = meta.rights ?? 'All rights reserved. No part of this publication may be reproduced or transmitted in any form without prior written permission.';
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
      <p>${e(rights)}</p>
      ${meta.publisher ? `<p>Published by ${e(meta.publisher)}</p>` : ''}
      ${meta.date ? `<p>${e(meta.date)}</p>` : ''}
      <p>ID: ${e(meta.identifier)}</p>
    </div>
  </section>
</body>
</html>`;
}

function deriveOutputPath(inputPath: string): string {
  // For directories, output is alongside the dir with the dir name
  return fs.statSync(inputPath).isDirectory()
    ? path.join(path.dirname(inputPath), `${path.basename(inputPath)}.epub`)
    : path.join(path.dirname(inputPath), `${path.basename(inputPath, path.extname(inputPath))}-glamoured.epub`);
}
