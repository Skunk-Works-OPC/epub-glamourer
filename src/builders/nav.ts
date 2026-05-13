import type { ExtractedChapter } from '../types/pipeline.js';
import { escapeXml } from '../normalizer.js';

export interface NavChapter {
  id: string;
  filename: string;
  title: string;
  epubType?: string;
}

export function buildNav(
  chapters: NavChapter[],
  title: string,
  language = 'en',
  coverFilename = 'cover.xhtml'
): string {
  const bodyChapters = chapters.filter(
    (c) => !['cover', 'titlepage', 'copyright-page'].includes(c.epubType ?? '')
  );
  const firstBodyChapter = bodyChapters[0];

  const tocItems = bodyChapters
    .map((c) => `      <li><a href="${c.filename}">${escapeXml(c.title)}</a></li>`)
    .join('\n');

  const landmarkItems = [
    `      <li><a epub:type="cover" href="${coverFilename}">Cover</a></li>`,
    `      <li><a epub:type="toc" href="toc.xhtml">Table of Contents</a></li>`,
    firstBodyChapter
      ? `      <li><a epub:type="bodymatter" href="${firstBodyChapter.filename}">Begin Reading</a></li>`
      : '',
  ]
    .filter(Boolean)
    .join('\n');

  return `<?xml version='1.0' encoding='UTF-8'?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml"
      xmlns:epub="http://www.idpf.org/2007/ops"
      xml:lang="${language}">
<head>
  <meta charset="utf-8"/>
  <title>Table of Contents</title>
  <link href="main.css" rel="stylesheet" type="text/css"/>
</head>
<body>
  <section epub:type="frontmatter">
    <nav epub:type="toc" role="doc-toc" aria-label="Table of Contents" id="toc">
      <h2>${escapeXml(title)}</h2>
      <ol>
${tocItems}
      </ol>
    </nav>
    <nav epub:type="landmarks" hidden="">
      <h2>Landmarks</h2>
      <ol>
${landmarkItems}
      </ol>
    </nav>
  </section>
</body>
</html>`;
}
