import { create } from 'xmlbuilder2';
import { XMLParser } from 'fast-xml-parser';
import * as path from 'path';
import type { EpubPackage, EpubMetadata, ManifestItem, SpineItem } from '../types/epub.js';

const GLAMOUR_CSS_ID = 'glamour-main-css';
const GLAMOUR_FONT_REGULAR_ID = 'glamour-font-lora-regular';
const GLAMOUR_FONT_ITALIC_ID = 'glamour-font-lora-italic';

export interface BuildOpfOptions {
  opfDir?: string;
  ncxId?: string;
  navId?: string;
}

/** Build a complete content.opf from scratch */
export function buildOpf(pkg: EpubPackage, opts: BuildOpfOptions = {}): string {
  const opfDir = opts.opfDir ?? pkg.opfDir ?? 'OEBPS';
  const ncxId = opts.ncxId ?? 'ncx';
  const navId = opts.navId ?? 'toc-nav';

  const doc = create({ version: '1.0', encoding: 'UTF-8' })
    .ele('package', {
      xmlns: 'http://www.idpf.org/2007/opf',
      version: '3.0',
      'unique-identifier': 'uid',
      'xml:lang': pkg.metadata.language ?? 'en',
    });

  // Metadata
  const metadata = doc.ele('metadata', {
    'xmlns:dc': 'http://purl.org/dc/elements/1.1/',
    'xmlns:opf': 'http://www.idpf.org/2007/opf',
  });
  metadata.ele('dc:identifier', { id: 'uid' }).txt(pkg.metadata.identifier);
  metadata.ele('dc:title').txt(pkg.metadata.title);
  metadata.ele('dc:creator').txt(pkg.metadata.author);
  metadata.ele('dc:language').txt(pkg.metadata.language ?? 'en');
  if (pkg.metadata.publisher) metadata.ele('dc:publisher').txt(pkg.metadata.publisher);
  if (pkg.metadata.date) metadata.ele('dc:date').txt(pkg.metadata.date);
  if (pkg.metadata.rights) metadata.ele('dc:rights').txt(pkg.metadata.rights);
  if (pkg.metadata.description) metadata.ele('dc:description').txt(pkg.metadata.description);
  if (pkg.metadata.subject) metadata.ele('dc:subject').txt(pkg.metadata.subject);
  metadata.ele('meta', { property: 'dcterms:modified' }).txt(
    pkg.metadata.modified ?? new Date().toISOString().replace(/\.\d{3}Z$/, 'Z')
  );

  // Manifest
  const manifest = doc.ele('manifest');

  // Glamour assets first
  manifest.ele('item', {
    id: GLAMOUR_CSS_ID,
    href: 'main.css',
    'media-type': 'text/css',
  });
  manifest.ele('item', {
    id: GLAMOUR_FONT_REGULAR_ID,
    href: 'fonts/Lora-Regular.ttf',
    'media-type': 'application/font-sfnt',
  });
  manifest.ele('item', {
    id: GLAMOUR_FONT_ITALIC_ID,
    href: 'fonts/Lora-Italic.ttf',
    'media-type': 'application/font-sfnt',
  });

  // All other manifest items
  for (const item of pkg.manifest) {
    if (isGlamourAsset(item.href)) continue;
    const attrs: Record<string, string> = {
      id: item.id,
      href: item.href,
      'media-type': item.mediaType,
    };
    if (item.properties) attrs.properties = item.properties;
    manifest.ele('item', attrs);
  }

  // Spine
  const spineAttrs: Record<string, string> = { toc: ncxId };
  const spine = doc.ele('spine', spineAttrs);
  for (const ref of pkg.spine) {
    const attrs: Record<string, string> = { idref: ref.idref };
    if (ref.linear === 'no') attrs.linear = 'no';
    spine.ele('itemref', attrs);
  }

  return doc.end({ prettyPrint: true });
}

/** Mutate an existing OPF string to inject glamour assets */
export function mutateOpf(opfXml: string, opfDir: string): string {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    isArray: (name) => ['item', 'itemref', 'meta'].includes(name),
    preserveOrder: true,
  });

  // Rather than deep-mutating the parsed tree (brittle with preserveOrder),
  // use string injection — insert glamour items after the first <manifest> tag
  // and update dcterms:modified.
  let result = opfXml;

  // Inject glamour CSS if not present
  if (!result.includes(GLAMOUR_CSS_ID) && !result.includes('main.css')) {
    const glamourItems = [
      `<item id="${GLAMOUR_CSS_ID}" href="main.css" media-type="text/css"/>`,
      `<item id="${GLAMOUR_FONT_REGULAR_ID}" href="fonts/Lora-Regular.ttf" media-type="application/font-sfnt"/>`,
      `<item id="${GLAMOUR_FONT_ITALIC_ID}" href="fonts/Lora-Italic.ttf" media-type="application/font-sfnt"/>`,
    ].join('\n    ');
    result = result.replace(/(<manifest[^>]*>)/, `$1\n    ${glamourItems}`);
  }

  // Update dcterms:modified
  const now = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
  result = result.replace(
    /(<meta[^>]*property="dcterms:modified"[^>]*>)[^<]*/,
    `$1${now}`
  );

  return result;
}

function isGlamourAsset(href: string): boolean {
  return href === 'main.css' ||
    href === 'fonts/Lora-Regular.ttf' ||
    href === 'fonts/Lora-Italic.ttf';
}

/** Compute the spine order from the manifest, given a list of chapter filenames in order */
export function buildSpineFromChapterOrder(
  chapters: Array<{ id: string; linear?: 'yes' | 'no' }>,
  coverItemId?: string,
  navItemId?: string
): SpineItem[] {
  const spine: SpineItem[] = [];

  if (coverItemId) spine.push({ idref: coverItemId, linear: 'no' });

  for (const ch of chapters) {
    spine.push({ idref: ch.id, linear: ch.linear });
  }

  return spine;
}
