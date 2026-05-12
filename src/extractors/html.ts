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

  let chunks: Array<{ title: string; html: string }>;
  if (h1s.length > 1) {
    chunks = splitOnH1($);
  } else {
    chunks = [{ title: docTitle, html: $('body').html() ?? '' }];
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

function buildXhtml(title: string, bodyHtml: string, lang: string): string {
  const safeTitle = escapeXml(title);
  return `<?xml version='1.0' encoding='UTF-8'?>
<html xmlns="http://www.w3.org/1999/xhtml"
      xmlns:epub="http://www.idpf.org/2007/ops"
      xml:lang="${lang}">
<head>
  <meta charset="utf-8"/>
  <title>${safeTitle}</title>
</head>
<body>
  <section epub:type="chapter">
    ${bodyHtml.trim()}
  </section>
</body>
</html>`;
}

function escapeXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
