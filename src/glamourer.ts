import * as fs from 'fs-extra';
import * as path from 'path';
import * as cheerio from 'cheerio';
import { mutateOpf } from './builders/opf.js';
import type { EpubPackage } from './types/epub.js';
import type { GlamourOptions } from './types/pipeline.js';

const ASSETS_DIR = path.join(__dirname, '..', 'assets');
const MAIN_CSS_PATH = path.join(ASSETS_DIR, 'main.css');
const FONT_REGULAR_PATH = path.join(ASSETS_DIR, 'fonts', 'Lora-Regular.ttf');
const FONT_ITALIC_PATH = path.join(ASSETS_DIR, 'fonts', 'Lora-Italic.ttf');

export async function glamourFiles(
  files: Map<string, Buffer>,
  epubPackage: EpubPackage,
  opts: GlamourOptions
): Promise<{ files: Map<string, Buffer>; opfXml: string }> {
  const opfDir = epubPackage.opfDir;

  // Load glamour assets
  const mainCss = await fs.readFile(MAIN_CSS_PATH);
  const fontRegular = await fs.readFile(FONT_REGULAR_PATH);
  const fontItalic = await fs.readFile(FONT_ITALIC_PATH);

  // Inject into files map (paths relative to ZIP root)
  files.set(path.join(opfDir, 'main.css').replace(/\\/g, '/'), mainCss);
  files.set(path.join(opfDir, 'fonts', 'Lora-Regular.ttf').replace(/\\/g, '/'), fontRegular);
  files.set(path.join(opfDir, 'fonts', 'Lora-Italic.ttf').replace(/\\/g, '/'), fontItalic);

  // Find all XHTML spine items and inject the CSS link
  const spineXhtmlPaths = getSpineXhtmlPaths(epubPackage);

  for (const xhtmlZipPath of spineXhtmlPaths) {
    const buf = files.get(xhtmlZipPath);
    if (!buf) continue;

    let xhtmlContent = buf.toString('utf8');

    // Compute relative path from the XHTML file's directory to main.css
    const xhtmlDir = path.dirname(xhtmlZipPath);
    const mainCssZipPath = path.join(opfDir, 'main.css').replace(/\\/g, '/');
    const cssRelPath = path.relative(xhtmlDir, mainCssZipPath).replace(/\\/g, '/');

    xhtmlContent = injectCssLink(xhtmlContent, cssRelPath);

    if (opts.stripPgBoilerplate) {
      xhtmlContent = stripPgBoilerplate(xhtmlContent);
    }

    files.set(xhtmlZipPath, Buffer.from(xhtmlContent, 'utf8'));
  }

  // Mutate the OPF to add glamour manifest entries
  const opfZipPath = epubPackage.opfPath;
  const opfBuf = files.get(opfZipPath);
  const originalOpf = opfBuf ? opfBuf.toString('utf8') : '';
  const mutatedOpf = mutateOpf(originalOpf, opfDir);
  files.set(opfZipPath, Buffer.from(mutatedOpf, 'utf8'));

  return { files, opfXml: mutatedOpf };
}

function getSpineXhtmlPaths(epubPackage: EpubPackage): string[] {
  const { manifest, spine, opfDir } = epubPackage;
  const manifestById = new Map(manifest.map((item) => [item.id, item]));
  const paths: string[] = [];

  for (const spineItem of spine) {
    const item = manifestById.get(spineItem.idref);
    if (!item) continue;
    if (item.mediaType !== 'application/xhtml+xml') continue;
    const zipPath = path.join(opfDir, item.href).replace(/\\/g, '/');
    paths.push(zipPath);
  }

  return paths;
}

function injectCssLink(xhtmlContent: string, cssHref: string): string {
  const $ = cheerio.load(xhtmlContent, { xmlMode: true });

  // Remove any existing link to main.css to avoid duplicates
  $('link[href$="main.css"]').remove();

  // Append as last stylesheet in <head>
  $('head').append(`<link href="${cssHref}" rel="stylesheet" type="text/css"/>`);

  return $.xml();
}

function stripPgBoilerplate(xhtmlContent: string): string {
  const $ = cheerio.load(xhtmlContent, { xmlMode: true });

  const selectors = [
    '.pgheader', '.pgfooter',
    '#pg-header', '#pg-footer',
    '.pg-boilerplate',
    'div[class*="pgheader"]',
    'div[class*="pgfooter"]',
    'table:has(a.pginternal)',
  ];

  for (const sel of selectors) {
    $(sel).remove();
  }

  return $.xml();
}
