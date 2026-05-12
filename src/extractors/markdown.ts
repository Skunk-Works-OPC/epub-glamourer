import * as fs from 'fs-extra';
import * as path from 'path';
import { marked } from 'marked';
import * as cheerio from 'cheerio';
import type { AnyNode, Element } from 'domhandler';
import type { ExtractResult, ExtractedChapter, GlamourOptions } from '../types/pipeline.js';

export async function extractMarkdown(inputPath: string, _opts: GlamourOptions): Promise<ExtractResult> {
  const raw = await fs.readFile(inputPath, 'utf8');
  const basename = path.basename(inputPath, path.extname(inputPath));

  const { content, frontMatter } = parseFrontMatter(raw);
  const html = await marked.parse(content);

  const chunks = splitOnH1(html);
  const globalTitle = frontMatter.title ?? guessTitle(html) ?? basename;
  const author = frontMatter.author ?? frontMatter.by ?? '';

  const chapters: ExtractedChapter[] = chunks.map((chunk, i) => {
    const id = `chapter-${String(i + 1).padStart(3, '0')}`;
    const title = chunk.title || (i === 0 ? globalTitle : `Chapter ${i + 1}`);
    const xhtmlContent = buildXhtml(title, chunk.html, frontMatter.lang ?? 'en');
    return { id, filename: `${id}.xhtml`, title, xhtmlContent, order: i, epubType: 'chapter' };
  });

  return {
    chapters,
    metadata: {
      title: globalTitle,
      author,
      language: frontMatter.lang ?? frontMatter.language ?? 'en',
      publisher: frontMatter.publisher,
      date: frontMatter.date,
      rights: frontMatter.rights,
      description: frontMatter.description,
    },
    images: new Map(),
  };
}

interface Chunk { title: string; html: string; }

function splitOnH1(html: string): Chunk[] {
  const $ = cheerio.load(html, { xmlMode: false });
  const h1s = $('h1');

  if (h1s.length === 0) return [{ title: '', html }];

  const chunks: Chunk[] = [];

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

  return chunks.length ? chunks : [{ title: '', html }];
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

function parseFrontMatter(raw: string): { content: string; frontMatter: Record<string, string> } {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
  if (!match) return { content: raw, frontMatter: {} };

  const fmLines = match[1].split('\n');
  const frontMatter: Record<string, string> = {};
  for (const line of fmLines) {
    const [key, ...rest] = line.split(':');
    if (key && rest.length) {
      frontMatter[key.trim()] = rest.join(':').trim().replace(/^['"]|['"]$/g, '');
    }
  }

  return { content: match[2], frontMatter };
}

function guessTitle(html: string): string | null {
  const match = html.match(/<h[123][^>]*>(.*?)<\/h[123]>/i);
  if (match) return match[1].replace(/<[^>]+>/g, '').trim();
  return null;
}

function escapeXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
