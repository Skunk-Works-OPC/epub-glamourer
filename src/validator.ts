import * as path from 'path';
import * as fs from 'fs-extra';
import * as os from 'os';
import { execFile } from 'child_process';
import { promisify } from 'util';
import JSZip from 'jszip';
import { XMLParser } from 'fast-xml-parser';
import type { ValidationResult } from './types/pipeline.js';

const execFileAsync = promisify(execFile);
const EPUBCHECK_VERSION = '5.1.0';
const EPUBCHECK_DIR = path.join(os.homedir(), '.epub-glamourer', `epubcheck-${EPUBCHECK_VERSION}`);
const EPUBCHECK_JAR = path.join(EPUBCHECK_DIR, 'epubcheck.jar');
const EPUBCHECK_URL = `https://github.com/w3c/epubcheck/releases/download/v${EPUBCHECK_VERSION}/epubcheck-${EPUBCHECK_VERSION}.zip`;

export async function validate(epubPath: string): Promise<ValidationResult> {
  if (await javaAvailable()) {
    return validateWithEpubcheck(epubPath);
  }
  return validateStructural(epubPath);
}

async function validateWithEpubcheck(epubPath: string): Promise<ValidationResult> {
  await ensureEpubcheck();
  const reportPath = epubPath + '.report.json';

  try {
    await execFileAsync('java', [
      '-jar', EPUBCHECK_JAR,
      epubPath,
      '--json', reportPath,
    ]);

    const report = await fs.readJson(reportPath).catch(() => null);
    await fs.remove(reportPath);

    if (!report) return { valid: true, errors: [], warnings: [], method: 'epubcheck' };

    const errors: string[] = (report.messages ?? [])
      .filter((m: { severity: string }) => m.severity === 'ERROR' || m.severity === 'FATAL')
      .map((m: { message: string; locations?: Array<{ path: string; line: number }> }) => {
        const loc = m.locations?.[0];
        return loc ? `${loc.path}:${loc.line} — ${m.message}` : m.message;
      });

    const warnings: string[] = (report.messages ?? [])
      .filter((m: { severity: string }) => m.severity === 'WARNING')
      .map((m: { message: string }) => m.message);

    return { valid: errors.length === 0, errors, warnings, method: 'epubcheck' };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return { valid: false, errors: [`epubcheck failed: ${message}`], warnings: [], method: 'epubcheck' };
  }
}

export async function validateStructural(epubPath: string): Promise<ValidationResult> {
  const errors: string[] = [];
  const warnings: string[] = [];

  try {
    const data = await fs.readFile(epubPath);
    const zip = await JSZip.loadAsync(data);

    // 1. mimetype check
    const mimetypeFile = zip.file('mimetype');
    if (!mimetypeFile) {
      errors.push('Missing mimetype file');
    } else {
      const content = (await mimetypeFile.async('string')).trim();
      if (content !== 'application/epub+zip') {
        errors.push(`Invalid mimetype: ${content}`);
      }
    }

    // 2. container.xml
    const containerFile = zip.file('META-INF/container.xml');
    if (!containerFile) {
      errors.push('Missing META-INF/container.xml');
      return { valid: errors.length === 0, errors, warnings, method: 'structural' };
    }

    const containerXml = await containerFile.async('string');
    const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_' });
    const container = parser.parse(containerXml);
    const opfPath: string = container?.container?.rootfiles?.rootfile?.['@_full-path'];
    if (!opfPath) {
      errors.push('container.xml has no OPF full-path');
      return { valid: errors.length === 0, errors, warnings, method: 'structural' };
    }

    // 3. OPF exists
    const opfFile = zip.file(opfPath);
    if (!opfFile) {
      errors.push(`OPF not found at declared path: ${opfPath}`);
      return { valid: errors.length === 0, errors, warnings, method: 'structural' };
    }

    // 4. Validate all manifest hrefs exist
    const opfXml = await opfFile.async('string');
    const opf = parser.parse(opfXml);
    const opfDir = path.dirname(opfPath);
    const items = opf?.package?.manifest?.item ?? [];
    const itemArr = Array.isArray(items) ? items : [items];

    for (const item of itemArr) {
      const href = item['@_href'];
      if (!href) continue;
      const zipPath = path.join(opfDir, href).replace(/\\/g, '/');
      if (!zip.file(zipPath)) {
        errors.push(`Manifest item missing in ZIP: ${zipPath}`);
      }
    }

    // 5. Nav document present
    const hasNav = itemArr.some(
      (item: { '@_properties'?: string }) =>
        (item['@_properties'] ?? '').includes('nav')
    );
    if (!hasNav) {
      warnings.push('No nav document (properties="nav") found in manifest');
    }

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    errors.push(`Structural check failed: ${message}`);
  }

  return { valid: errors.length === 0, errors, warnings, method: 'structural' };
}

async function javaAvailable(): Promise<boolean> {
  try {
    await execFileAsync('java', ['-version']);
    return true;
  } catch {
    return false;
  }
}

async function ensureEpubcheck(): Promise<void> {
  if (await fs.pathExists(EPUBCHECK_JAR)) return;

  process.stderr.write(`Downloading epubcheck ${EPUBCHECK_VERSION}...\n`);
  await fs.ensureDir(EPUBCHECK_DIR);
  const zipPath = EPUBCHECK_DIR + '.zip';

  await downloadWithRedirects(EPUBCHECK_URL, zipPath);

  const zipData = await fs.readFile(zipPath);
  const zip = await JSZip.loadAsync(zipData);
  const prefix = `epubcheck-${EPUBCHECK_VERSION}/`;

  // Extract the entire epubcheck-X.Y.Z/ folder so lib/*.jar files are available
  // alongside the main jar (epubcheck.jar's manifest references them via Class-Path)
  const tasks: Promise<void>[] = [];
  zip.forEach((relPath, entry) => {
    if (entry.dir) return;
    if (!relPath.startsWith(prefix)) return;
    const outPath = path.join(EPUBCHECK_DIR, relPath.slice(prefix.length));
    tasks.push(
      (async () => {
        await fs.ensureDir(path.dirname(outPath));
        const buf = await entry.async('nodebuffer');
        await fs.writeFile(outPath, buf);
      })()
    );
  });
  await Promise.all(tasks);

  if (!await fs.pathExists(EPUBCHECK_JAR)) {
    throw new Error(`epubcheck.jar not found at ${EPUBCHECK_JAR}`);
  }

  await fs.remove(zipPath);
  process.stderr.write('epubcheck ready.\n');
}

function downloadWithRedirects(url: string, dest: string): Promise<void> {
  return new Promise(async (resolve, reject) => {
    const https = await import('https');
    const follow = (currentUrl: string) => {
      https.get(currentUrl, (res) => {
        if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          follow(res.headers.location);
          return;
        }
        const file = fs.createWriteStream(dest);
        res.pipe(file);
        file.on('finish', () => file.close(() => resolve()));
        file.on('error', reject);
      }).on('error', reject);
    };
    follow(url);
  });
}
