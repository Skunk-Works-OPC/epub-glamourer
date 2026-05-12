import * as fs from 'fs-extra';
import * as path from 'path';
import { normalizeXhtmlFragment } from '../normalizer.js';
import type { ExtractResult, ExtractedChapter, GlamourOptions } from '../types/pipeline.js';

const CHAPTER_HEADING = /^(CHAPTER|Chapter|PART|Part|Section|SECTION)\s+(\S+.*)/;
const ROMAN_NUMERAL = /^(I{1,3}|IV|V|VI{0,3}|IX|X{1,3}|XL|L|XC|C|CD|D|CM|M+)(\.|\s|$)/i;

export async function extractTxt(inputPath: string, _opts: GlamourOptions): Promise<ExtractResult> {
  const raw = await fs.readFile(inputPath, 'utf8');
  const basename = path.basename(inputPath, path.extname(inputPath));

  const lines = raw.split(/\r?\n/);
  const chunks = splitIntoChunks(lines);

  const chapters: ExtractedChapter[] = chunks.map((chunk, i) => {
    const id = `chapter-${String(i + 1).padStart(3, '0')}`;
    const title = chunk.title || (i === 0 ? basename : `Chapter ${i + 1}`);
    const body = wrapParagraphs(chunk.paragraphs);
    const xhtmlContent = `<?xml version='1.0' encoding='UTF-8'?>
<html xmlns="http://www.w3.org/1999/xhtml"
      xmlns:epub="http://www.idpf.org/2007/ops"
      xml:lang="en">
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

    return { id, filename: `${id}.xhtml`, title, xhtmlContent, order: i, epubType: 'chapter' };
  });

  const title = guessTitle(lines) || basename;

  return {
    chapters,
    metadata: { title, language: 'en' },
    images: new Map(),
  };
}

interface Chunk {
  title: string;
  paragraphs: string[];
}

function splitIntoChunks(lines: string[]): Chunk[] {
  const chunks: Chunk[] = [];
  let current: Chunk = { title: '', paragraphs: [] };

  for (const line of lines) {
    const trimmed = line.trim();
    if (CHAPTER_HEADING.test(trimmed) || (trimmed.length > 0 && trimmed.length < 60 && ROMAN_NUMERAL.test(trimmed))) {
      if (current.paragraphs.length > 0 || current.title) {
        chunks.push(current);
      }
      current = { title: trimmed, paragraphs: [] };
    } else {
      current.paragraphs.push(trimmed);
    }
  }

  if (current.paragraphs.length > 0 || current.title) chunks.push(current);

  if (chunks.length === 0) chunks.push({ title: '', paragraphs: lines.map((l) => l.trim()) });

  return chunks;
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
      buffer.push(line);
    }
  }
  if (buffer.length > 0) paragraphs.push(buffer.join(' ').trim());

  return paragraphs
    .filter((p) => p.length > 0)
    .map((p) => `<p class="story">${escapeXml(p)}</p>`)
    .join('\n    ');
}

function guessTitle(lines: string[]): string {
  for (const line of lines.slice(0, 20)) {
    const t = line.trim();
    if (t.length > 2 && t.length < 100 && !/^(by |By |BY )/.test(t)) return t;
  }
  return '';
}

function escapeXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
