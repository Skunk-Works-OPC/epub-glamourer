import * as fs from 'fs-extra';
import * as path from 'path';
import * as cheerio from 'cheerio';
import type { AnyNode, Element } from 'domhandler';
import type { ExtractResult, ExtractedChapter, GlamourOptions } from '../types/pipeline.js';

export async function extractHtml(inputPath: string, _opts: GlamourOptions): Promise<ExtractResult> {
  const raw = await fs.readFile(inputPath, 'utf8');
  const basename = path.basename(inputPath, path.extname(inputPath));
  return parseHtmlContent(raw, basename);
}

export function parseHtmlContent(raw: string, basename: string): ExtractResult {
  const $ = cheerio.load(raw, { xmlMode: false });

  $('script, noscript').remove();
  $('style').remove();

  const docTitle = $('title').first().text().trim() || basename;
  const lang = $('html').attr('lang') ?? $('html').attr('xml:lang') ?? 'en';

  $('img').each((_, el) => { if (!$(el).attr('alt')) $(el).attr('alt', ''); });

  const h1s = $('h1');
  const chapterH2s = $('h2').filter((_, el) => $(el).children('a[id]').length > 0);

  // ── Picture book detection ───────────────────────────────────────
  // A picture book has few/no chapter headings but many illustrations.
  const imgCount = $('body img').length;
  const isPictureBook = chapterH2s.length < 2 && h1s.length <= 1 && imgCount >= 5;

  if (isPictureBook) {
    stripPictureBookPreamble($);
    const bodyHtml = $('body').html() ?? '';
    const id = 'chapter-001';
    const xhtmlContent = buildXhtml(docTitle, bodyHtml, lang, 'picture-book');
    return {
      chapters: [{ id, filename: `${id}.xhtml`, title: docTitle, xhtmlContent, order: 0, epubType: 'chapter' }],
      metadata: { title: docTitle, language: lang },
      images: new Map(),
      isPictureBook: true,
    };
  }

  let chunks: Array<{ title: string; html: string }>;
  if (h1s.length > 1) {
    chunks = splitOnH1($);
  } else {
    chunks = splitOnChapterH2($) ?? [{ title: docTitle, html: $('body').html() ?? '' }];
  }

  const chapters: ExtractedChapter[] = chunks.map((chunk, i) => {
    const id = `chapter-${String(i + 1).padStart(3, '0')}`;
    const title = chunk.title || (i === 0 ? docTitle : `Section ${i + 1}`);
    const xhtmlContent = buildXhtml(title, chunk.html, lang);
    return { id, filename: `${id}.xhtml`, title, xhtmlContent, order: i, epubType: 'chapter' };
  });

  return {
    chapters,
    metadata: { title: docTitle, language: lang },
    images: new Map(),
  };
}

/**
 * Strips the embedded title block from Project Gutenberg picture books.
 * Removes headings (title, author, publisher lines), the PG start separator,
 * and any illustrations that appear before the first story paragraph.
 */
function stripPictureBookPreamble($: cheerio.CheerioAPI): void {
  $('#pg-start-separator').remove();

  // Walk body children in order; remove pre-story elements until we reach
  // the first paragraph with substantial text (the story proper).
  let foundStory = false;
  $('body').children().toArray().forEach((child) => {
    if (foundStory) return;
    const $child = $(child);
    const tag = (child as Element).name;

    if (tag === 'p') {
      if ($child.text().trim().length > 20) {
        foundStory = true; // this is the story start — keep it and everything after
      } else {
        $child.remove(); // short pre-story paragraph (PG metadata line)
      }
      return;
    }

    // Remove pre-story elements: headings, illustration divs, images, rules, tables, PG sections
    if (['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'div', 'section', 'img', 'hr', 'table', 'ul', 'ol'].includes(tag)) {
      $child.remove();
    }
  });
}

/**
 * Splits on <h2> elements that have a direct child <a id="..."> anchor.
 * Matches the Project Gutenberg chapter heading pattern and similar structures.
 * Returns null if fewer than 2 such headings exist.
 * Content before the first matching <h2> (preamble/boilerplate) is discarded.
 */
function splitOnChapterH2($: cheerio.CheerioAPI): Array<{ title: string; html: string }> | null {
  const chapterH2s = $('h2').filter((_, el) => $(el).children('a[id]').length > 0);
  if (chapterH2s.length < 2) return null;

  const chunks: Array<{ title: string; html: string }> = [];

  chapterH2s.each((_, h2El) => {
    const rawH2 = $.html(h2El);
    const title = rawH2
      .replace(/<br\s*\/?>/gi, ' ')
      .replace(/<[^>]+>/g, '')
      .replace(/&[a-zA-Z]+;/g, ' ')
      .trim()
      .replace(/\s+/g, ' ');

    let chunkHtml = rawH2;
    let node: AnyNode | null = (h2El as Element).next ?? null;
    while (node) {
      const nodeEl = node as Element;
      if (nodeEl.type === 'tag' && nodeEl.name === 'h2' && $(nodeEl).children('a[id]').length > 0) break;
      chunkHtml += $.html(node);
      node = nodeEl.next ?? null;
    }
    chunks.push({ title, html: chunkHtml });
  });

  return chunks.length >= 2 ? chunks : null;
}

function splitOnH1($: cheerio.CheerioAPI): Array<{ title: string; html: string }> {
  const chunks: Array<{ title: string; html: string }> = [];
  const h1s = $('h1');

  h1s.each((_, h1El) => {
    const title = $(h1El).text().trim();
    let chunkHtml = '';
    let node: AnyNode | null = (h1El as Element).next ?? null;
    while (node) {
      const nodeEl = node as Element;
      if (nodeEl.type === 'tag' && nodeEl.name === 'h1') break;
      chunkHtml += $.html(node);
      node = nodeEl.next ?? null;
    }
    chunks.push({ title, html: chunkHtml });
  });

  return chunks.length ? chunks : [{ title: '', html: $('body').html() ?? '' }];
}

const HTML_NAMED_ENTITIES: Record<string, string> = {
  nbsp: '&#160;', mdash: '&#8212;', ndash: '&#8211;',
  lsquo: '&#8216;', rsquo: '&#8217;', ldquo: '&#8220;', rdquo: '&#8221;',
  hellip: '&#8230;', copy: '&#169;', reg: '&#174;', trade: '&#8482;',
  laquo: '&#171;', raquo: '&#187;', middot: '&#183;', bull: '&#8226;',
  dagger: '&#8224;', Dagger: '&#8225;', permil: '&#8240;',
  euro: '&#8364;', pound: '&#163;', yen: '&#165;', cent: '&#162;',
  eacute: '&#233;', Eacute: '&#201;', agrave: '&#224;', Agrave: '&#192;',
  egrave: '&#232;', Egrave: '&#200;', aacute: '&#225;', oacute: '&#243;',
  ouml: '&#246;', uuml: '&#252;', auml: '&#228;', iuml: '&#239;',
  ntilde: '&#241;', ccedil: '&#231;', szlig: '&#223;',
};
const XML_SAFE_ENTITIES = new Set(['amp', 'lt', 'gt', 'quot', 'apos']);

function resolveHtmlEntities(html: string): string {
  return html.replace(/&([a-zA-Z]+);/g, (match, name) => {
    if (XML_SAFE_ENTITIES.has(name)) return match;
    return HTML_NAMED_ENTITIES[name] ?? match;
  });
}

function selfCloseVoids(html: string): string {
  return html.replace(
    /<(br|hr|img|input|meta|link|param|source|embed|wbr|area|base|col|track)((?:\s[^>]*?)?)\s*(?<!\/)>/gi,
    '<$1$2/>',
  );
}

function buildXhtml(title: string, bodyHtml: string, lang: string, sectionClass?: string): string {
  const safeTitle = escapeXml(title);
  const xmlBody = resolveHtmlEntities(selfCloseVoids(bodyHtml));
  const classAttr = sectionClass ? ` class="${sectionClass}"` : '';
  return `<?xml version='1.0' encoding='UTF-8'?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml"
      xmlns:epub="http://www.idpf.org/2007/ops"
      xml:lang="${lang}">
<head>
  <meta charset="utf-8"/>
  <title>${safeTitle}</title>
</head>
<body>
  <section epub:type="chapter"${classAttr}>
    ${xmlBody.trim()}
  </section>
</body>
</html>`;
}

function escapeXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
