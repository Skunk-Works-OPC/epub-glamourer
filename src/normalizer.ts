import * as cheerio from 'cheerio';

const XHTML_NS = 'http://www.w3.org/1999/xhtml';
const EPUB_NS = 'http://www.idpf.org/2007/ops';

export function normalizeXhtml(html: string, language = 'en'): string {
  const $ = cheerio.load(html, { xmlMode: false });

  $('script, noscript').remove();
  $('style').remove();

  $('img').each((_, el) => {
    if (!$(el).attr('alt')) $(el).attr('alt', '');
  });

  $('[id]').each((_, el) => {
    const raw = $(el).attr('id') ?? '';
    const sanitized = sanitizeNcName(raw);
    if (sanitized !== raw) $(el).attr('id', sanitized);
  });

  $('[name]').each((_, el) => {
    const raw = $(el).attr('name') ?? '';
    const sanitized = sanitizeNcName(raw);
    if (sanitized !== raw) $(el).attr('name', sanitized);
  });

  const bodyContent = $('body').html() ?? '';
  return buildXhtmlDocument(bodyContent, getTitle($), language);
}

export function normalizeXhtmlFragment(fragment: string, title: string, language = 'en'): string {
  const $ = cheerio.load(`<div>${fragment}</div>`, { xmlMode: false });

  $('script, noscript').remove();
  $('style').remove();

  $('img').each((_, el) => {
    if (!$(el).attr('alt')) $(el).attr('alt', '');
  });

  $('[id]').each((_, el) => {
    const raw = $(el).attr('id') ?? '';
    const sanitized = sanitizeNcName(raw);
    if (sanitized !== raw) $(el).attr('id', sanitized);
  });

  const content = $('div').first().html() ?? fragment;
  return buildXhtmlDocument(content, title, language);
}

export function buildXhtmlDocument(bodyContent: string, title: string, language = 'en'): string {
  const safeTitle = escapeXml(title);
  return `<?xml version='1.0' encoding='UTF-8'?>
<html xmlns="${XHTML_NS}"
      xmlns:epub="${EPUB_NS}"
      xml:lang="${language}">
<head>
  <meta charset="utf-8"/>
  <title>${safeTitle}</title>
</head>
<body>
${bodyContent}
</body>
</html>`;
}

function getTitle($: cheerio.CheerioAPI): string {
  return $('title').first().text().trim() || 'Untitled';
}

export function sanitizeNcName(raw: string): string {
  if (!raw) return 'id-empty';
  let result = raw.replace(/[^a-zA-Z0-9._-]/g, '-');
  if (/^[^a-zA-Z_]/.test(result)) result = 'id-' + result;
  return result || 'id-empty';
}

export function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export function injectCssLink(xhtmlContent: string, cssHref: string): string {
  const $ = cheerio.load(xhtmlContent, { xmlMode: true });

  const cssFilename = cssHref.split('/').pop() ?? cssHref;
  $(`link[href$="${cssFilename}"]`).remove();
  $('head').append(`<link href="${cssHref}" rel="stylesheet" type="text/css"/>`);

  return $.xml();
}

export function stripInlineStyles(xhtmlContent: string): string {
  const $ = cheerio.load(xhtmlContent, { xmlMode: true });
  $('style').remove();
  return $.xml();
}
