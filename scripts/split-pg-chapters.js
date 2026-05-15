const fs = require('fs');
const path = require('path');
const cheerio = require('cheerio');

const INPUT_HTML = process.argv[2];
const OUT_DIR = process.argv[3];

if (!INPUT_HTML || !OUT_DIR) {
  console.error('Usage: node split-pg-chapters.js <input.html> <output-dir>');
  process.exit(1);
}

const raw = fs.readFileSync(INPUT_HTML, 'utf8');
const $ = cheerio.load(raw, { xmlMode: false });

// Remove PG boilerplate
$('#pg-header, #pg-footer, #pg-machine-header, #pg-start-separator, #pg-end-separator').remove();
$('.pg-boilerplate, .pgheader').remove();

// Find all chapter divs
const chapterDivs = $('div.chapter').toArray();
console.log(`Found ${chapterDivs.length} div.chapter elements`);

const chapters = [];
let chapterIndex = 0;

for (let i = 0; i < chapterDivs.length; i++) {
  const div = chapterDivs[i];
  const $div = $(div);
  
  // Skip empty divs
  const text = $div.text().trim();
  if (!text) continue;
  
  // Get heading
  const h2 = $div.find('h2').first();
  const h1 = $div.find('h1').first();
  let title = '';
  let isPart = false;
  
  if (h2.length) {
    const h2Text = h2.text().trim().replace(/\s+/g, ' ');
    title = h2Text;
    // Parts have anchors like part01, part02; chapters have anchors like chap01
    const aId = h2.find('a').attr('id') || '';
    isPart = aId.startsWith('part');
  } else if (h1.length) {
    title = h1.text().trim();
  }
  
  // Get inner HTML (everything inside the chapter div)
  let innerHtml = '';
  const children = $div.contents().toArray();
  for (const child of children) {
    innerHtml += $.html(child);
  }
  
  chapters.push({
    index: i,
    title,
    isPart,
    html: innerHtml,
    hasContent: $div.find('p').length > 0 || $div.find('img').length > 0
  });
}

console.log(`Filtered to ${chapters.length} non-empty chapters`);

// Write each chapter as an individual HTML file
fs.mkdirSync(OUT_DIR, { recursive: true });

let outputIndex = 1;
for (const ch of chapters) {
  // Skip pure part headers that have no content (they're just section dividers)
  // But we want to keep them if they have content, or if they're the first/last
  if (!ch.hasContent && ch.isPart) {
    // For now, keep parts as separate chapters to preserve structure
    // In the EPUB, readers can navigate through them
  }
  
  const paddedIndex = String(outputIndex).padStart(3, '0');
  const outPath = path.join(OUT_DIR, `chapter-${paddedIndex}.html`);
  
  const xhtml = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xml:lang="en">
<head>
  <meta charset="utf-8"/>
  <title>${escapeXml(ch.title || 'Chapter')}</title>
</head>
<body>
${ch.html}
</body>
</html>`;
  
  fs.writeFileSync(outPath, xhtml, 'utf8');
  console.log(`  ${path.basename(outPath)}: "${ch.title.substring(0, 60)}" (${ch.isPart ? 'PART' : 'chapter'}, ${ch.hasContent ? 'has content' : 'empty'})`);
  outputIndex++;
}

console.log(`\nWrote ${outputIndex - 1} chapter files to ${OUT_DIR}`);

function escapeXml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
