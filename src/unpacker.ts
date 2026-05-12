import JSZip from 'jszip';
import * as fs from 'fs-extra';
import * as path from 'path';
import { XMLParser } from 'fast-xml-parser';
import type { EpubPackage, EpubMetadata, ManifestItem, SpineItem } from './types/epub.js';

export class EpubUnpackError extends Error {}

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  isArray: (name) => ['item', 'itemref', 'meta'].includes(name),
});

export async function unpack(epubPath: string): Promise<{
  epubPackage: EpubPackage;
  files: Map<string, Buffer>;
}> {
  const data = await fs.readFile(epubPath);
  const zip = await JSZip.loadAsync(data);

  const mimetypeFile = zip.file('mimetype');
  if (!mimetypeFile) throw new EpubUnpackError('Missing mimetype file');
  const mimetype = (await mimetypeFile.async('string')).trim();
  if (mimetype !== 'application/epub+zip') {
    throw new EpubUnpackError(`Invalid mimetype: ${mimetype}`);
  }

  const containerFile = zip.file('META-INF/container.xml');
  if (!containerFile) throw new EpubUnpackError('Missing META-INF/container.xml');
  const containerXml = await containerFile.async('string');
  const opfPath = extractOpfPath(containerXml);

  const opfFile = zip.file(opfPath);
  if (!opfFile) throw new EpubUnpackError(`OPF not found at: ${opfPath}`);
  const opfXml = await opfFile.async('string');
  const epubPackage = parseOpf(opfXml, opfPath);

  const files = new Map<string, Buffer>();
  const tasks: Promise<void>[] = [];
  zip.forEach((relativePath, zipEntry) => {
    if (!zipEntry.dir) {
      tasks.push(
        zipEntry.async('nodebuffer').then((buf) => {
          files.set(relativePath, buf);
        })
      );
    }
  });
  await Promise.all(tasks);

  return { epubPackage, files };
}

function extractOpfPath(containerXml: string): string {
  const parsed = xmlParser.parse(containerXml);
  const rootfiles = parsed?.container?.rootfiles?.rootfile;
  if (!rootfiles) throw new EpubUnpackError('No rootfiles in container.xml');
  const rootfile = Array.isArray(rootfiles) ? rootfiles[0] : rootfiles;
  const opfPath = rootfile['@_full-path'];
  if (!opfPath) throw new EpubUnpackError('No full-path in container.xml rootfile');
  return opfPath;
}

function parseOpf(opfXml: string, opfPath: string): EpubPackage {
  const opfDir = path.dirname(opfPath);
  const parsed = xmlParser.parse(opfXml);
  const pkg = parsed?.package;
  if (!pkg) throw new EpubUnpackError('Invalid OPF: no <package> element');

  const meta = pkg.metadata ?? pkg['opf:metadata'] ?? {};
  const manifestRaw = pkg.manifest?.item ?? [];
  const spineRaw = pkg.spine?.itemref ?? [];

  const metadata: EpubMetadata = {
    title: extractDcField(meta, 'title') ?? 'Untitled',
    author: extractDcField(meta, 'creator') ?? 'Unknown',
    language: extractDcField(meta, 'language') ?? 'en',
    identifier: extractDcField(meta, 'identifier') ?? '',
    modified: extractMetaProperty(meta, 'dcterms:modified') ?? new Date().toISOString(),
    subject: extractDcField(meta, 'subject'),
    publisher: extractDcField(meta, 'publisher'),
    date: extractDcField(meta, 'date'),
    rights: extractDcField(meta, 'rights'),
    description: extractDcField(meta, 'description'),
  };

  const manifest: ManifestItem[] = manifestRaw.map((item: Record<string, string>) => ({
    id: item['@_id'] ?? '',
    href: item['@_href'] ?? '',
    mediaType: item['@_media-type'] ?? '',
    properties: item['@_properties'],
  }));

  const spine: SpineItem[] = spineRaw.map((ref: Record<string, string>) => ({
    idref: ref['@_idref'] ?? '',
    linear: ref['@_linear'] as 'yes' | 'no' | undefined,
  }));

  const coverImageId = extractMetaProperty(meta, 'cover') ??
    manifest.find((m) => m.properties === 'cover-image')?.id;
  if (coverImageId) {
    const coverItem = manifest.find((m) => m.id === coverImageId);
    if (coverItem) metadata.coverImagePath = path.join(opfDir, coverItem.href);
  }

  return { metadata, manifest, spine, opfPath, opfDir };
}

function extractDcField(meta: Record<string, unknown>, field: string): string | undefined {
  const keys = [`dc:${field}`, field];
  for (const key of keys) {
    const val = meta[key];
    if (typeof val === 'string') return val;
    if (typeof val === 'object' && val !== null) {
      const obj = val as Record<string, unknown>;
      if (typeof obj['#text'] === 'string') return obj['#text'];
      if (typeof obj['@_id'] !== 'undefined' && typeof obj['#text'] === 'string') return obj['#text'];
    }
    if (Array.isArray(val) && val.length > 0) {
      const first = val[0];
      if (typeof first === 'string') return first;
      if (typeof first === 'object' && first !== null) {
        const f = first as Record<string, unknown>;
        if (typeof f['#text'] === 'string') return f['#text'];
      }
    }
  }
  return undefined;
}

function extractMetaProperty(meta: Record<string, unknown>, property: string): string | undefined {
  const metas = meta['meta'];
  if (!Array.isArray(metas)) return undefined;
  for (const m of metas) {
    if (typeof m === 'object' && m !== null) {
      const mo = m as Record<string, unknown>;
      if (mo['@_property'] === property && typeof mo['#text'] === 'string') {
        return mo['#text'];
      }
      if (mo['@_name'] === property && typeof mo['@_content'] === 'string') {
        return mo['@_content'];
      }
    }
  }
  return undefined;
}
