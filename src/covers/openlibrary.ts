/**
 * OpenLibrary cover lookup. No API key required.
 *
 * Flow:
 *   1. Search via /search.json?title=...&author=...&limit=5
 *   2. Pick the first result with a cover_i (cover ID)
 *   3. Fetch /b/id/{cover_i}-L.jpg
 *
 * All network errors and missing-cover cases return null so the caller can
 * fall back to the generated SVG without failure.
 */
import * as https from 'https';

const SEARCH_URL = 'https://openlibrary.org/search.json';
const COVER_URL = 'https://covers.openlibrary.org/b/id';
const TIMEOUT_MS = 8000;

export interface CoverLookupResult {
  buffer: Buffer;
  source: 'openlibrary';
  coverId: number;
}

export async function fetchCoverFromOpenLibrary(
  title: string,
  author: string,
  opts: { verbose?: boolean } = {}
): Promise<CoverLookupResult | null> {
  if (!title || title === 'Untitled') return null;

  try {
    const searchUrl = buildSearchUrl(title, author);
    if (opts.verbose) process.stderr.write(`[cover] openlibrary search: ${searchUrl}\n`);
    const searchBody = await httpsGet(searchUrl);
    const parsed = JSON.parse(searchBody.toString('utf8')) as {
      docs?: Array<{ cover_i?: number; title?: string; author_name?: string[] }>;
    };

    const doc = parsed.docs?.find((d) => typeof d.cover_i === 'number');
    if (!doc?.cover_i) {
      if (opts.verbose) process.stderr.write('[cover] no openlibrary match\n');
      return null;
    }

    const imgUrl = `${COVER_URL}/${doc.cover_i}-L.jpg`;
    if (opts.verbose) process.stderr.write(`[cover] fetching ${imgUrl}\n`);
    const buffer = await httpsGet(imgUrl);

    // OpenLibrary returns a 1x1 placeholder GIF when no cover exists for the
    // ID. Anything under 1 KB is almost certainly the placeholder.
    if (buffer.length < 1024) {
      if (opts.verbose) process.stderr.write('[cover] openlibrary placeholder, skipping\n');
      return null;
    }

    return { buffer, source: 'openlibrary', coverId: doc.cover_i };
  } catch (err: unknown) {
    if (opts.verbose) {
      const msg = err instanceof Error ? err.message : String(err);
      process.stderr.write(`[cover] openlibrary lookup failed: ${msg}\n`);
    }
    return null;
  }
}

function buildSearchUrl(title: string, author: string): string {
  const params = new URLSearchParams();
  params.set('title', title);
  if (author && author !== 'Unknown') params.set('author', author);
  params.set('limit', '5');
  params.set('fields', 'title,author_name,cover_i');
  return `${SEARCH_URL}?${params.toString()}`;
}

function httpsGet(url: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { timeout: TIMEOUT_MS }, (res) => {
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        httpsGet(res.headers.location).then(resolve, reject);
        return;
      }
      if (res.statusCode !== 200) {
        reject(new Error(`HTTP ${res.statusCode} for ${url}`));
        return;
      }
      const chunks: Buffer[] = [];
      res.on('data', (chunk: Buffer) => chunks.push(chunk));
      res.on('end', () => resolve(Buffer.concat(chunks)));
      res.on('error', reject);
    });
    req.on('timeout', () => { req.destroy(new Error(`Timeout after ${TIMEOUT_MS}ms`)); });
    req.on('error', reject);
  });
}
