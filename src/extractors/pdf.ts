import * as fs from 'fs-extra';
import * as path from 'path';
// pdf-parse does not ship ESM types; require it at runtime
import type { ExtractResult, ExtractedChapter, GlamourOptions } from '../types/pipeline.js';

const CHAPTER_HEADING_PDF = /^(CHAPTER|Chapter|PART|Part|Section|SECTION)\s+\S/;
const ALL_CAPS_SHORT = /^[A-Z][A-Z\s\d,.'"-]{0,58}[A-Z.!?]$/;

export async function extractPdf(inputPath: string, opts: GlamourOptions): Promise<ExtractResult> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const pdfParse = require('pdf-parse') as (buf: Buffer) => Promise<{ text: string; info: Record<string, string> }>;
  const buffer = await fs.readFile(inputPath);
  const result = await pdfParse(buffer);
  const basename = path.basename(inputPath, path.extname(inputPath));

  const title = (result.info?.Title as string | undefined) || guessTitle(result.text) || basename;
  const author = (result.info?.Author as string | undefined) || '';

  const lines = result.text.split('\n').map((l: string) => l.trim());
  const chunks = splitLines(lines);

  if (opts.verbose) {
    process.stderr.write(`[pdf] Extracted ${lines.length} lines → ${chunks.length} chapters\n`);
  }

  const chapters: ExtractedChapter[] = chunks.map((chunk, i) => {
    const id = `chapter-${String(i + 1).padStart(3, '0')}`;
    const chTitle = chunk.title || (i === 0 ? title : `Chapter ${i + 1}`);
    const body = wrapParagraphs(chunk.lines);
    const xhtmlContent = buildXhtml(chTitle, body, 'en');
    return { id, filename: `${id}.xhtml`, title: chTitle, xhtmlContent, order: i, epubType: 'chapter' };
  });

  return {
    chapters,
    metadata: { title, author, language: 'en' },
    images: new Map(),
  };
}

interface PdfChunk { title: string; lines: string[]; }

function splitLines(lines: string[]): PdfChunk[] {
  const chunks: PdfChunk[] = [];
  let current: PdfChunk = { title: '', lines: [] };

  for (const line of lines) {
    if (
      CHAPTER_HEADING_PDF.test(line) ||
      (line.length > 2 && line.length < 60 && ALL_CAPS_SHORT.test(line) && current.lines.length > 10)
    ) {
      if (current.lines.length > 0 || current.title) chunks.push(current);
      current = { title: line, lines: [] };
    } else {
      current.lines.push(line);
    }
  }

  if (current.lines.length > 0 || current.title) chunks.push(current);
  return chunks.length ? chunks : [{ title: '', lines }];
}

function wrapParagraphs(lines: string[]): string {
  const paragraphs: string[] = [];
  let buffer: string[] = [];

  for (const line of lines) {
    if (line === '') {
      if (buffer.length > 0) {
        paragraphs.push(buffer.join(' ').trim());
        buffer = [];
      }
    } else {
      // Heuristic: if the previous line ends with sentence-terminating punct, start new paragraph
      if (buffer.length > 0 && /[.!?]["']?\s*$/.test(buffer[buffer.length - 1])) {
        paragraphs.push(buffer.join(' ').trim());
        buffer = [line];
      } else {
        buffer.push(line);
      }
    }
  }
  if (buffer.length > 0) paragraphs.push(buffer.join(' ').trim());

  return paragraphs
    .filter((p) => p.length > 0)
    .map((p) => `<p class="story">${escapeXml(p)}</p>`)
    .join('\n    ');
}

function guessTitle(text: string): string | null {
  const lines = text.split('\n').map((l) => l.trim()).filter((l) => l.length > 0);
  for (const line of lines.slice(0, 10)) {
    if (line.length > 2 && line.length < 100) return line;
  }
  return null;
}

function buildXhtml(title: string, body: string, lang: string): string {
  return `<?xml version='1.0' encoding='UTF-8'?>
<html xmlns="http://www.w3.org/1999/xhtml"
      xmlns:epub="http://www.idpf.org/2007/ops"
      xml:lang="${lang}">
<head>
  <meta charset="utf-8"/>
  <title>${escapeXml(title)}</title>
</head>
<body>
  <section epub:type="chapter">
    ${body}
  </section>
</body>
</html>`;
}

function escapeXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
