#!/usr/bin/env ts-node
/**
 * page-dev.ts — live preview server for all static EPUB page templates.
 *
 * Usage:  npm run preview:pages
 *
 * Opens a browser with a sidebar listing every static page (cover, title,
 * copyright, estorya-classics, rights-attribution, toc-nav).  Watches
 * templates/ and assets/main.css for changes and triggers an instant
 * browser reload via Server-Sent Events — no extra dependencies.
 */

import express from 'express';
import * as path from 'path';
import * as fs from 'fs-extra';
import * as http from 'http';
import * as fsNative from 'fs';
import open from 'open';
import * as cheerio from 'cheerio';
import Handlebars from 'handlebars';
import { buildCoverXhtml, buildCoverSvg } from './builders/cover.js';
import { buildNav } from './builders/nav.js';
import { buildMetadata } from './metadata.js';

const ASSETS_DIR  = path.join(__dirname, '..', 'assets');
const TEMPLATES_DIR = path.join(__dirname, '..', 'templates');
const PORT = 3457;

// ── Sample context used to render every template ─────────────────────────────

const SAMPLE_META = buildMetadata({
  title:     'The Secret Garden',
  author:    'Frances Hodgson Burnett',
  language:  'en',
  publisher: 'Frederick A. Stokes Company',
  date:      '1911',
  rights:    'Public domain in the USA',
});

const SAMPLE_CHAPTERS = [
  { id: 'chapter-001', filename: 'chapter-001.xhtml', title: 'Chapter I — Mistress Mary Quite Contrary', epubType: 'chapter' },
  { id: 'chapter-002', filename: 'chapter-002.xhtml', title: 'Chapter II — The Robin Who Showed the Way', epubType: 'chapter' },
  { id: 'chapter-003', filename: 'chapter-003.xhtml', title: 'Chapter III — Inside the Secret Garden',   epubType: 'chapter' },
];

const TEMPLATE_CTX = {
  author:   SAMPLE_META.author,
  year:     String(new Date().getFullYear()),
  language: SAMPLE_META.language,
};

// ── Page registry ─────────────────────────────────────────────────────────────

interface Page {
  id: string;
  label: string;
  render: () => Promise<string> | string;
}

async function renderTemplate(name: string, ctx: Record<string, unknown>): Promise<string> {
  const src = await fs.readFile(path.join(TEMPLATES_DIR, name), 'utf8');
  return Handlebars.compile(src)(ctx);
}

function e(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function buildTitlePageHtml(meta: typeof SAMPLE_META): string {
  return `<?xml version='1.0' encoding='UTF-8'?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="${meta.language}">
<head><meta charset="utf-8"/><title>${e(meta.title)}</title><link href="main.css" rel="stylesheet" type="text/css"/></head>
<body>
  <section epub:type="titlepage">
    <div class="title-page">
      <span class="ornament">&#10087;</span>
      <p class="book-title">${e(meta.title)}</p>
      <p class="book-author">${e(meta.author)}</p>
      ${meta.publisher ? `<p class="book-publisher">${e(meta.publisher)}</p>` : ''}
      ${meta.date ? `<p class="book-publisher">${e(meta.date)}</p>` : ''}
    </div>
  </section>
</body></html>`;
}

function buildCopyrightHtml(meta: typeof SAMPLE_META): string {
  const rights = meta.rights ?? 'All rights reserved.';
  return `<?xml version='1.0' encoding='UTF-8'?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="${meta.language}">
<head><meta charset="utf-8"/><title>Copyright</title><link href="main.css" rel="stylesheet" type="text/css"/></head>
<body>
  <section epub:type="copyright-page">
    <div class="copyright-page">
      <p><em>${e(meta.title)}</em></p>
      <p>By ${e(meta.author)}</p>
      <p>${e(rights)}</p>
      ${meta.publisher ? `<p>Published by ${e(meta.publisher)}</p>` : ''}
      ${meta.date ? `<p>${e(meta.date)}</p>` : ''}
      <p>ID: ${e(meta.identifier)}</p>
    </div>
  </section>
</body></html>`;
}

const ALL_PAGES: Page[] = [
  {
    id: 'cover',
    label: 'Cover',
    render: () => buildCoverXhtml('/cover-placeholder.svg', SAMPLE_META.title, SAMPLE_META.language),
  },
  {
    id: 'title-page',
    label: 'Title Page',
    render: () => buildTitlePageHtml(SAMPLE_META),
  },
  {
    id: 'copyright',
    label: 'Copyright',
    render: () => buildCopyrightHtml(SAMPLE_META),
  },
  {
    id: 'toc-nav',
    label: 'Table of Contents',
    render: () => buildNav(
      [
        { id: 'cover',      filename: 'cover.xhtml',      title: 'Cover',     epubType: 'cover'         },
        { id: 'title-page', filename: 'title-page.xhtml', title: 'Title Page',epubType: 'titlepage'     },
        { id: 'copyright',  filename: 'copyright.xhtml',  title: 'Copyright', epubType: 'copyright-page'},
        { id: 'toc-nav',    filename: 'toc.xhtml',        title: 'Contents',  epubType: 'toc'           },
        ...SAMPLE_CHAPTERS,
        { id: 'estorya-classics',   filename: 'estorya-classics.xhtml',   title: 'eStorya Classics',  epubType: 'backmatter' },
        { id: 'rights-attribution', filename: 'rights-attribution.xhtml', title: 'Rights & Attribution', epubType: 'backmatter' },
      ],
      SAMPLE_META.title,
      SAMPLE_META.language
    ),
  },
  {
    id: 'estorya-classics',
    label: 'eStorya Classics Edition',
    render: () => renderTemplate('estorya-classics.xhtml.hbs', TEMPLATE_CTX),
  },
  {
    id: 'rights-attribution',
    label: 'Rights & Attribution',
    render: () => renderTemplate('rights-attribution.xhtml.hbs', TEMPLATE_CTX),
  },
];

// ── SSE reload machinery ───────────────────────────────────────────────────────

const sseClients = new Set<express.Response>();

function broadcastReload() {
  for (const res of sseClients) {
    res.write('data: reload\n\n');
  }
}

function watchForChanges() {
  const targets = [TEMPLATES_DIR, path.join(ASSETS_DIR, 'main.css')];
  for (const target of targets) {
    fsNative.watch(target, { recursive: true }, (_evt, filename) => {
      if (!filename) return;
      console.log(`  [watch] changed: ${filename} — reloading…`);
      broadcastReload();
    });
  }
}

// ── HTML shell ────────────────────────────────────────────────────────────────

function shell(pageId: string, bodyHtml: string): string {
  const navLinks = ALL_PAGES
    .map(p => `<a href="/page/${p.id}" data-id="${p.id}" class="${p.id === pageId ? 'active' : ''}">${p.label}</a>`)
    .join('\n    ');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <title>Page Dev — ${pageId}</title>
  <link rel="stylesheet" href="/assets/main.css"/>
  <style>
    html, body { margin: 0; padding: 0; background: #e8e4dd; }
    #layout { display: flex; min-height: 100vh; }
    #nav { width: 220px; min-width: 220px; background: #0F1B2E; color: #F2EFE6; padding: 1.5em 1em; font-family: sans-serif; }
    #nav h2 { color: #22C55E; font-size: 0.65em; letter-spacing: 0.15em; text-transform: uppercase; margin-bottom: 1em; border-bottom: 1px solid rgba(34,197,94,0.3); padding-bottom: 0.5em; }
    #nav a { display: block; color: #F2EFE6; text-decoration: none; padding: 0.35em 0.6em; font-size: 0.8em; border-radius: 4px; margin-bottom: 3px; }
    #nav a:hover { background: rgba(34,197,94,0.15); }
    #nav a.active { background: rgba(34,197,94,0.25); color: #22C55E; }
    #main { flex: 1; display: flex; flex-direction: column; }
    #banner { background: #0B1220; color: #22C55E; padding: 0.5em 1.5em; font-size: 0.7em; letter-spacing: 0.08em; font-family: sans-serif; display: flex; justify-content: space-between; align-items: center; }
    #banner .dot { width: 8px; height: 8px; border-radius: 50%; background: #22C55E; display: inline-block; margin-right: 6px; animation: pulse 2s infinite; }
    @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.3} }
    #content { max-width: 720px; background: #ffffff; padding: 3em 3.5em; margin: 2.5em auto; box-shadow: 0 4px 24px rgba(0,0,0,0.12); min-height: 500px; }
  </style>
</head>
<body>
<div id="layout">
  <nav id="nav">
    <h2>Pages</h2>
    ${navLinks}
  </nav>
  <div id="main">
    <div id="banner">
      <span><span class="dot"></span>Live preview — editing templates/ &amp; assets/main.css auto-reloads</span>
      <span>${pageId}</span>
    </div>
    <div id="content">
      ${bodyHtml}
    </div>
  </div>
</div>
<script>
  // Navigate without full reload
  document.querySelectorAll('#nav a').forEach(link => {
    link.addEventListener('click', async e => {
      e.preventDefault();
      const id = link.dataset.id;
      const res = await fetch('/page/' + id + '?fragment=1');
      document.getElementById('content').innerHTML = await res.text();
      document.querySelectorAll('#nav a').forEach(l => l.classList.remove('active'));
      link.classList.add('active');
      document.querySelector('#banner span:last-child').textContent = id;
      window.scrollTo(0, 0);
    });
  });

  // SSE live reload
  const es = new EventSource('/sse');
  es.onmessage = async () => {
    const active = document.querySelector('#nav a.active');
    if (!active) return location.reload();
    const id = active.dataset.id;
    const res = await fetch('/page/' + id + '?fragment=1');
    document.getElementById('content').innerHTML = await res.text();
  };
  es.onerror = () => setTimeout(() => location.reload(), 500);
</script>
</body>
</html>`;
}

function extractBody(html: string): string {
  const $ = cheerio.load(html, { xmlMode: false });
  return $('body').html() ?? html;
}

// ── Server ────────────────────────────────────────────────────────────────────

async function main() {
  const app = express();

  // Static assets (CSS, fonts, images)
  app.use('/assets', express.static(ASSETS_DIR));
  // Serve assets/images at both /images and /page/images so relative paths
  // inside templates resolve correctly regardless of the page route.
  app.use('/images', express.static(path.join(ASSETS_DIR, 'images')));
  app.use('/page/images', express.static(path.join(ASSETS_DIR, 'images')));

  // Generated SVG cover placeholder
  app.get('/cover-placeholder.svg', (_req, res) => {
    res.setHeader('Content-Type', 'image/svg+xml');
    res.send(buildCoverSvg(SAMPLE_META.title, SAMPLE_META.author));
  });

  // SSE endpoint for live reload
  app.get('/sse', (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();
    sseClients.add(res);
    req.on('close', () => sseClients.delete(res));
  });

  // Root → first page
  app.get('/', (_req, res) => res.redirect(`/page/${ALL_PAGES[0].id}`));

  // Page renderer
  app.get('/page/:id', async (req, res) => {
    const page = ALL_PAGES.find(p => p.id === req.params.id);
    if (!page) { res.status(404).send('Page not found'); return; }

    try {
      const xhtml = await page.render();
      const body = extractBody(xhtml);
      if (req.query.fragment === '1') {
        res.send(body);
      } else {
        res.send(shell(page.id, body));
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      const errHtml = `<div style="color:red;font-family:monospace;padding:1em;border:1px solid red"><strong>Render error</strong><pre>${msg}</pre></div>`;
      if (req.query.fragment === '1') {
        res.send(errHtml);
      } else {
        res.send(shell(page.id, errHtml));
      }
    }
  });

  const server = http.createServer(app);
  await new Promise<void>(resolve => server.listen(PORT, resolve));

  watchForChanges();

  const url = `http://localhost:${PORT}`;
  console.log(`\n  Page dev server running at ${url}`);
  console.log(`  Watching: templates/  assets/main.css`);
  console.log(`  Ctrl+C to stop.\n`);
  await open(url);
}

main().catch(err => { console.error(err); process.exit(1); });
