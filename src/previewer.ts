import express from 'express';
import * as path from 'path';
import * as fs from 'fs-extra';
import * as http from 'http';
import * as readline from 'readline';
import open from 'open';
import * as cheerio from 'cheerio';
import type { Server } from 'http';

const ASSETS_DIR = path.join(__dirname, '..', 'assets');

export interface PreviewChapter {
  id: string;
  filename: string;
  title: string;
  xhtmlContent: string;
}

export async function preview(
  chapters: PreviewChapter[],
  title: string,
  port = 3456
): Promise<void> {
  const app = express();

  // Serve glamour assets
  app.use('/assets', express.static(ASSETS_DIR));

  // Main page — render first chapter
  app.get('/', (_req, res) => {
    const first = chapters[0];
    res.send(renderPage(title, chapters, first?.xhtmlContent ?? '<p>No content.</p>'));
  });

  // Individual chapter endpoint
  app.get('/chapter/:id', (req, res) => {
    const chapter = chapters.find((c) => c.id === req.params.id);
    if (!chapter) {
      res.status(404).send('<p>Chapter not found.</p>');
      return;
    }
    // Return just the body content (for SPA-style loading)
    if (req.headers['x-fragment'] === '1') {
      res.send(extractBody(chapter.xhtmlContent));
    } else {
      res.send(renderPage(title, chapters, chapter.xhtmlContent));
    }
  });

  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(port, resolve));

  const url = `http://localhost:${port}`;
  console.log(`\n  Preview ready: ${url}\n`);
  await open(url);

  await waitForUser();
  server.close();
}

function renderPage(
  title: string,
  chapters: PreviewChapter[],
  currentContent: string
): string {
  const chapterLinks = chapters
    .map((c) => `<a href="/chapter/${c.id}" data-id="${c.id}">${escapeHtml(c.title)}</a>`)
    .join('\n    ');

  const bodyContent = extractBody(currentContent);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <title>Preview: ${escapeHtml(title)}</title>
  <link rel="stylesheet" href="/assets/main.css"/>
  <style>
    html, body { margin: 0; padding: 0; background: #f0ede8; }
    #layout { display: flex; min-height: 100vh; }
    #nav { width: 220px; min-width: 220px; background: #1e3a5f; color: #faf7f2; padding: 1.5em 1em; }
    #nav h2 { color: #b8924a; font-size: 0.7em; letter-spacing: 0.15em; text-transform: uppercase; margin-bottom: 1em; border-bottom: 1px solid rgba(184,146,74,0.4); padding-bottom: 0.5em; }
    #nav a { display: block; color: #faf7f2; text-decoration: none; padding: 0.3em 0.5em; font-size: 0.8em; border-radius: 3px; margin-bottom: 2px; cursor: pointer; }
    #nav a:hover, #nav a.active { background: rgba(184,146,74,0.25); color: #b8924a; }
    #main { flex: 1; display: flex; flex-direction: column; }
    #banner { background: #1e3a5f; color: #b8924a; padding: 0.6em 1.5em; font-size: 0.75em; letter-spacing: 0.08em; display: flex; justify-content: space-between; }
    #content { max-width: 760px; background: #faf7f2; padding: 2.5em 3em; margin: 2em auto; box-shadow: 0 2px 16px rgba(0,0,0,0.1); }
  </style>
</head>
<body>
<div id="layout">
  <nav id="nav">
    <h2>Contents</h2>
    ${chapterLinks}
  </nav>
  <div id="main">
    <div id="banner">
      <span>epub-glamourer &#10087; preview</span>
      <span>${escapeHtml(title)}</span>
    </div>
    <div id="content">
      ${bodyContent}
    </div>
  </div>
</div>
<script>
  const links = document.querySelectorAll('#nav a');
  links.forEach(link => {
    link.addEventListener('click', async e => {
      e.preventDefault();
      const id = link.dataset.id;
      const res = await fetch('/chapter/' + id, { headers: { 'X-Fragment': '1' } });
      const html = await res.text();
      document.getElementById('content').innerHTML = html;
      links.forEach(l => l.classList.remove('active'));
      link.classList.add('active');
      window.scrollTo(0, 0);
    });
  });
  if (links.length) links[0].classList.add('active');
</script>
</body>
</html>`;
}

function extractBody(xhtmlContent: string): string {
  const $ = cheerio.load(xhtmlContent, { xmlMode: false });
  return $('body').html() ?? xhtmlContent;
}

async function waitForUser(): Promise<void> {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question('\n  Close preview and continue packaging? [Y/n] ', (answer) => {
      rl.close();
      resolve();
    });
  });
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
