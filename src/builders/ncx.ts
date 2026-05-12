import { escapeXml } from '../normalizer.js';

export interface NcxChapter {
  id: string;
  filename: string;
  title: string;
}

export function buildNcx(
  chapters: NcxChapter[],
  title: string,
  uid: string,
  author = ''
): string {
  const bodyChapters = chapters.filter(
    (c) => !['cover', 'titlepage', 'copyright-page'].includes((c as { epubType?: string }).epubType ?? '')
  );

  let playOrder = 1;
  const navPoints = bodyChapters
    .map((c) => {
      const po = playOrder++;
      return `  <navPoint id="nav-${c.id}" playOrder="${po}">
    <navLabel><text>${escapeXml(c.title)}</text></navLabel>
    <content src="${c.filename}"/>
  </navPoint>`;
    })
    .join('\n');

  return `<?xml version='1.0' encoding='UTF-8'?>
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1" xml:lang="en">
<head>
  <meta name="dtb:uid" content="${escapeXml(uid)}"/>
  <meta name="dtb:depth" content="1"/>
  <meta name="dtb:totalPageCount" content="0"/>
  <meta name="dtb:maxPageNumber" content="0"/>
</head>
<docTitle><text>${escapeXml(title)}</text></docTitle>
<docAuthor><text>${escapeXml(author)}</text></docAuthor>
<navMap>
${navPoints}
</navMap>
</ncx>`;
}
