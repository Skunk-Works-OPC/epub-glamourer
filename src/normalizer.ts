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

  const bodyContent = resolveHtmlEntities(selfCloseVoids($('body').html() ?? ''));
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

  const content = resolveHtmlEntities(selfCloseVoids($('div').first().html() ?? fragment));
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
