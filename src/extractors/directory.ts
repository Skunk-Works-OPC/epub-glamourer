import * as fs from 'fs-extra';
import * as path from 'path';
import { extractMarkdown } from './markdown.js';
import { extractHtml } from './html.js';
import { extractTxt } from './txt.js';
import { extractDocx } from './docx.js';
import { getExtractor } from './index.js';
import type { ExtractResult, ExtractedChapter, GlamourOptions } from '../types/pipeline.js';
import type { EpubMetadata } from '../types/epub.js';

const SUPPORTED_EXT = new Set(['.md', '.markdown', '.html', '.htm', '.xhtml', '.txt', '.docx']);
const IMAGE_EXT = new Set(['.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp']);

export async function extractDirectory(
  dirPath: string,
  opts: GlamourOptions
): Promise<ExtractResult> {
  const entries = await fs.readdir(dirPath);

  // 1. Read metadata.json if present
  let metadata: Partial<EpubMetadata> = {};
  const metaPath = path.join(dirPath, 'metadata.json');
  if (await fs.pathExists(metaPath)) {
    metadata = await fs.readJson(metaPath) as Partial<EpubMetadata>;
  }

  // 2. Collect chapter source files in sorted order
  const chapterFiles = entries
    .filter((f) => {
      const ext = path.extname(f).toLowerCase();
      return SUPPORTED_EXT.has(ext) && !f.startsWith('.');
    })
    .sort();

  if (chapterFiles.length === 0) {
    throw new Error(`No chapter source files found in directory: ${dirPath}`);
  }

  // 3. Extract each chapter file in order, flatten results
  const allChapters: ExtractedChapter[] = [];
  const images = new Map<string, Buffer>();
  let chapterIndex = 0;

  for (const filename of chapterFiles) {
    const fullPath = path.join(dirPath, filename);
    const extractor = getExtractor(fullPath);
    if (!extractor) continue;

    const result = await extractor(fullPath, opts);

    // First file's metadata seeds (lowest precedence); metadata.json overrides
    if (chapterIndex === 0 && Object.keys(metadata).length === 0) {
      metadata = result.metadata;
    } else {
      // Fill blanks only — metadata.json wins
      for (const [k, v] of Object.entries(result.metadata)) {
        if (!(k in metadata) || !(metadata as Record<string, unknown>)[k]) {
          (metadata as Record<string, unknown>)[k] = v;
        }
      }
    }

    for (const ch of result.chapters) {
      const id = `chapter-${String(allChapters.length + 1).padStart(3, '0')}`;
      allChapters.push({
        ...ch,
        id,
        filename: `${id}.xhtml`,
        order: allChapters.length,
      });
    }

    for (const [imgName, imgBuf] of result.images) {
      images.set(imgName, imgBuf);
    }

    chapterIndex++;
  }

  // 4. Collect images from an /images subfolder if present
  const imagesDir = path.join(dirPath, 'images');
  if (await fs.pathExists(imagesDir)) {
    const imgEntries = await fs.readdir(imagesDir);
    for (const imgFile of imgEntries) {
      const ext = path.extname(imgFile).toLowerCase();
      if (!IMAGE_EXT.has(ext)) continue;
      images.set(imgFile, await fs.readFile(path.join(imagesDir, imgFile)));
    }
  }

  return { chapters: allChapters, metadata, images };
}

export async function isDirectoryInput(inputPath: string): Promise<boolean> {
  try {
    const stat = await fs.stat(inputPath);
    return stat.isDirectory();
  } catch {
    return false;
  }
}
