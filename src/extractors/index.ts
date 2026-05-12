import * as path from 'path';
import type { ExtractResult, GlamourOptions } from '../types/pipeline.js';

export interface Extractor {
  canHandle(inputPath: string): boolean;
  extract(inputPath: string, options: GlamourOptions): Promise<ExtractResult>;
}

export { extractTxt } from './txt.js';
export { extractMarkdown } from './markdown.js';
export { extractHtml } from './html.js';
export { extractDocx } from './docx.js';
export { extractPdf } from './pdf.js';

import { extractTxt } from './txt.js';
import { extractMarkdown } from './markdown.js';
import { extractHtml } from './html.js';
import { extractDocx } from './docx.js';
import { extractPdf } from './pdf.js';

const EXTRACTORS: Record<string, (inputPath: string, opts: GlamourOptions) => Promise<ExtractResult>> = {
  '.txt': extractTxt,
  '.md': extractMarkdown,
  '.markdown': extractMarkdown,
  '.html': extractHtml,
  '.htm': extractHtml,
  '.xhtml': extractHtml,
  '.docx': extractDocx,
  '.pdf': extractPdf,
};

export function getExtractor(
  inputPath: string
): ((inputPath: string, opts: GlamourOptions) => Promise<ExtractResult>) | undefined {
  const ext = path.extname(inputPath).toLowerCase();
  return EXTRACTORS[ext];
}
