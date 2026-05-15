#!/usr/bin/env node
/**
 * ePub Visual QA Screenshotter — Playwright-based page rendering.
 * Usage: node visual-epub-screenshotter.js </path/to/Book.epub> [output-dir]
 *
 * Unzips the ePub, starts a tiny HTTP server, screenshots key pages,
 * and checks for broken images + layout issues.
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const http = require('http');
const { chromium } = require('playwright');

const EPUB_PATH = process.argv[2];
const OUT_DIR = process.argv[3] || '/tmp/epub-visual-qa';
const PORT = 9876;

if (!EPUB_PATH || !fs.existsSync(EPUB_PATH)) {
  console.error('Usage: node visual-epub-screenshotter.js </path/to/Book.epub> [output-dir]');
  process.exit(1);
}

// ── Step 1: Unzip EPUB ──
const basename = path.basename(EPUB_PATH, '.epub');
const UNZIP_DIR = path.join('/tmp', `epub-visual-${basename}-${Date.now()}`);
fs.mkdirSync(UNZIP_DIR, { recursive: true });
execSync(`unzip -q "${EPUB_PATH}" -d "${UNZIP_DIR}"`);

// Find OEBPS or OPS directory
const rootEntries = fs.readdirSync(UNZIP_DIR);
let contentDir = UNZIP_DIR;
if (rootEntries.includes('OEBPS')) contentDir = path.join(UNZIP_DIR, 'OEBPS');
else if (rootEntries.includes('OPS')) contentDir = path.join(UNZIP_DIR, 'OPS');

fs.mkdirSync(OUT_DIR, { recursive: true });

// ── Step 2: Parse OPF spine to get correct order ──
const containerXml = fs.readFileSync(path.join(UNZIP_DIR, 'META-INF', 'container.xml'), 'utf8');
const opfRelPath = containerXml.match(/full-path="([^"]+)"/)?.[1] || 'OEBPS/content.opf';
const opfPath = path.join(UNZIP_DIR, opfRelPath);
const opfDir = path.dirname(opfPath);
const opfContent = fs.readFileSync(opfPath, 'utf8');

// Extract spine itemrefs
const spineMatches = [...opfContent.matchAll(/itemref idref="([^"]+)"/g)];
const spineIdrefs = spineMatches.map(m => m[1]);

// Build manifest id → href map
const manifestItems = [...opfContent.matchAll(/item id="([^"]+)"\s+[^\u003e]*href="([^"]+)"/g)];
const manifestMap = {};
for (const m of manifestItems) manifestMap[m[1]] = m[2];

// Build spine URLs in order
const spineUrls = spineIdrefs.map(idref => {
  const href = manifestMap[idref];
  if (!href) return null;
  return href;
}).filter(Boolean);

// ── Step 3: Start HTTP server ──
const server = http.createServer((req, res) => {
  let filePath = path.join(contentDir, decodeURIComponent(req.url));
  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    // Try index.xhtml fallback for directory roots
    const indexPath = path.join(filePath, 'index.xhtml');
    if (fs.existsSync(indexPath)) filePath = indexPath;
  }
  if (!fs.existsSync(filePath)) {
    res.writeHead(404); res.end('Not found'); return;
  }
  const ext = path.extname(filePath).toLowerCase();
  const mime = {
    '.xhtml': 'application/xhtml+xml',
    '.html': 'text/html',
    '.htm': 'text/html',
    '.css': 'text/css',
    '.js': 'application/javascript',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.xml': 'application/xml',
    '.opf': 'application/oebps-package+xml',
    '.ncx': 'application/x-dtbncx+xml'
  }[ext] || 'application/octet-stream';
  res.writeHead(200, { 'Content-Type': mime });
  fs.createReadStream(filePath).pipe(res);
});

server.listen(PORT, async () => {
  console.log(`🖼️  Visual QA starting for: ${basename}`);
  console.log(`   Server: http://localhost:${PORT}/`);
  console.log(`   Output: ${OUT_DIR}/\n`);

  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 1200, height: 1600 },
    deviceScaleFactor: 2
  });
  const page = await context.newPage();

  // ── Define pages to screenshot ──
  // We map common spine item names to human-readable labels
  const pageDefs = [
    { name: 'cover',     matcher: n => /cover/i.test(n),       label: 'Cover' },
    { name: 'title',     matcher: n => /title-page/i.test(n),  label: 'Title Page' },
    { name: 'copyright', matcher: n => /copyright/i.test(n),   label: 'Copyright' },
    { name: 'toc',       matcher: n => /toc/i.test(n),         label: 'Table of Contents' },
    { name: 'ch1',       matcher: n => /chapter-00[1-4]/i.test(n), label: 'First Chapter' },
    { name: 'ch-mid',    matcher: n => {
      const m = n.match(/chapter-(\d+)/);
      if (!m) return false;
      const idx = Math.floor(spineUrls.length / 2);
      const target = spineUrls[idx];
      return n === target;
    }, label: 'Mid Book Chapter' },
    { name: 'ch-last',   matcher: n => {
      const chapters = spineUrls.filter(u => /chapter/i.test(u));
      return chapters.length > 0 && n === chapters[chapters.length - 1];
    }, label: 'Last Chapter' },
    { name: 'estorya',   matcher: n => /estorya-classics/i.test(n), label: 'eStorya Classics' },
    { name: 'rights',    matcher: n => /rights-attribution/i.test(n), label: 'Rights Attribution' }
  ];

  const results = [];

  for (const def of pageDefs) {
    const spineItem = spineUrls.find(def.matcher);
    if (!spineItem) {
      results.push({ name: def.name, label: def.label, status: 'MISSING', url: null });
      console.log(`  ⚠️  ${def.label}: spine item not found`);
      continue;
    }

    const url = `http://localhost:${PORT}/${spineItem}`;
    try {
      await page.goto(url, { waitUntil: 'networkidle' });
      await page.waitForTimeout(800); // Let fonts / SVG settle

      const screenshotPath = path.join(OUT_DIR, `${basename}-${def.name}.png`);
      await page.screenshot({ path: screenshotPath, fullPage: true });

      // Detect broken images
      const broken = await page.evaluate(() => {
        return Array.from(document.querySelectorAll('img'))
          .filter(img => !img.complete || img.naturalWidth === 0 || img.naturalHeight === 0)
          .map(img => img.src);
      });

      // Detect layout overflow
      const overflow = await page.evaluate(() => {
        const els = document.querySelectorAll('img, table, pre, svg');
        const issues = [];
        for (const el of els) {
          if (el.scrollWidth > el.clientWidth + 2) {
            issues.push(`${el.tagName} overflow`);
          }
        }
        return issues;
      });

      const textLen = await page.evaluate(() => document.body.innerText.length);

      results.push({
        name: def.name,
        label: def.label,
        status: broken.length > 0 ? 'BROKEN_IMAGES' : 'OK',
        url: spineItem,
        screenshot: screenshotPath,
        brokenImages: broken,
        overflow: overflow,
        textLength: textLen
      });

      const statusIcon = broken.length > 0 ? '❌' : '✅';
      console.log(`  ${statusIcon} ${def.label}: ${spineItem}`);
      if (broken.length > 0) {
        console.log(`     ⚠️  ${broken.length} broken image(s)`);
      }
      if (overflow.length > 0) {
        console.log(`     ⚠️  ${overflow.length} overflow element(s)`);
      }
    } catch (e) {
      results.push({ name: def.name, label: def.label, status: 'ERROR', error: e.message });
      console.log(`  ❌ ${def.label}: ERROR — ${e.message}`);
    }
  }

  await browser.close();
  server.close();

  // ── Report ──
  const ok = results.filter(r => r.status === 'OK');
  const bad = results.filter(r => r.status !== 'OK' && r.status !== 'MISSING');
  const missing = results.filter(r => r.status === 'MISSING');

  console.log(`\n${'='.repeat(60)}`);
  console.log(`  VISUAL QA REPORT — ${basename}`);
  console.log(`${'='.repeat(60)}`);
  console.log(`  Pages checked: ${results.length}`);
  console.log(`  ✅ OK:        ${ok.length}`);
  console.log(`  ❌ Issues:     ${bad.length}`);
  console.log(`  ⚠️  Missing:   ${missing.length}`);
  console.log(`\n  Screenshots saved to: ${OUT_DIR}/`);
  console.log(`${'='.repeat(60)}`);

  if (bad.length > 0) {
    console.log('\n  🚫 DO NOT SHIP — fix issues first\n');
    process.exit(1);
  } else {
    console.log('\n  🚢 CLEARED FOR DELIVERY\n');
    process.exit(0);
  }
});
