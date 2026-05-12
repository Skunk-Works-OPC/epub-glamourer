import * as fs from 'fs-extra';
import * as path from 'path';
import mammoth from 'mammoth';
import { parseHtmlContent } from './html.js';
import type { ExtractResult, GlamourOptions } from '../types/pipeline.js';

const STYLE_MAP = [
  "p[style-name='Heading 1'] => h1:fresh",
  "p[style-name='Heading 2'] => h2:fresh",
  "p[style-name='Heading 3'] => h3:fresh",
  "p[style-name='Normal'] => p.story:fresh",
  "p[style-name='Body Text'] => p.story:fresh",
  "r[style-name='Italic'] => em",
  "r[style-name='Bold'] => strong",
  "r[style-name='Emphasis'] => em",
  "r[style-name='Strong'] => strong",
  "p[style-name='Block Text'] => blockquote > p:fresh",
  "p[style-name='Quotations'] => blockquote > p:fresh",
];

export async function extractDocx(inputPath: string, opts: GlamourOptions): Promise<ExtractResult> {
  const basename = path.basename(inputPath, path.extname(inputPath));
  const buffer = await fs.readFile(inputPath);

  const result = await mammoth.convertToHtml(
    { buffer },
    { styleMap: STYLE_MAP }
  );

  if (opts.verbose && result.messages.length > 0) {
    for (const msg of result.messages) {
      if (msg.type === 'warning') process.stderr.write(`[docx] ${msg.message}\n`);
    }
  }

  // Wrap in a minimal HTML document and pass through the HTML extractor
  const wrappedHtml = `<!DOCTYPE html><html lang="en"><head><title>${escapeXml(basename)}</title></head><body>${result.value}</body></html>`;
  return parseHtmlContent(wrappedHtml, basename);
}

function escapeXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
