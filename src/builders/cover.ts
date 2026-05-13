import * as Handlebars from 'handlebars';
import * as fs from 'fs-extra';
import * as path from 'path';

export function buildCoverXhtml(
  coverImageFilename: string,
  title: string,
  language = 'en',
  cssPath = 'main.css'
): string {
  return `<?xml version='1.0' encoding='UTF-8'?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml"
      xmlns:epub="http://www.idpf.org/2007/ops"
      xml:lang="${language}">
<head>
  <meta charset="utf-8"/>
  <title>${title}</title>
  <link href="${cssPath}" rel="stylesheet" type="text/css"/>
</head>
<body>
  <section epub:type="cover">
    <img src="${coverImageFilename}" alt="Cover: ${title}" class="cover-image"/>
  </section>
</body>
</html>`;
}

export function buildCoverSvg(title: string, author: string): Buffer {
  const safeTitle = escapeForSvg(title);
  const safeAuthor = escapeForSvg(author);

  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 2400" width="1600" height="2400">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#1e3a5f"/>
      <stop offset="100%" stop-color="#0d1f35"/>
    </linearGradient>
  </defs>
  <!-- Background -->
  <rect width="1600" height="2400" fill="url(#bg)"/>
  <!-- Decorative border -->
  <rect x="60" y="60" width="1480" height="2280" fill="none" stroke="#b8924a" stroke-width="3"/>
  <rect x="80" y="80" width="1440" height="2240" fill="none" stroke="#b8924a" stroke-width="1" stroke-dasharray="8,4"/>
  <!-- Ornament top -->
  <text x="800" y="380" font-family="Georgia, serif" font-size="120" fill="#b8924a" text-anchor="middle">❧</text>
  <!-- Title -->
  <text x="800" y="620" font-family="Georgia, serif" font-size="110" fill="#faf7f2" text-anchor="middle" font-weight="bold">${safeTitle}</text>
  <!-- Divider -->
  <line x1="300" y1="720" x2="1300" y2="720" stroke="#b8924a" stroke-width="2"/>
  <!-- Author -->
  <text x="800" y="820" font-family="Georgia, serif" font-size="64" fill="#b8924a" text-anchor="middle" letter-spacing="8">${safeAuthor}</text>
  <!-- Ornament bottom -->
  <text x="800" y="2200" font-family="Georgia, serif" font-size="80" fill="#b8924a" text-anchor="middle" opacity="0.6">✦</text>
</svg>`;

  return Buffer.from(svg, 'utf8');
}

function escapeForSvg(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
