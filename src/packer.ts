import JSZip from 'jszip';
import * as fs from 'fs-extra';
import * as path from 'path';

export async function pack(
  files: Map<string, Buffer>,
  outputPath: string
): Promise<void> {
  await fs.ensureDir(path.dirname(outputPath));

  const zip = new JSZip();

  // mimetype MUST be first and uncompressed (EPUB spec requirement)
  const mimetypeContent = files.get('mimetype') ?? Buffer.from('application/epub+zip');
  zip.file('mimetype', mimetypeContent, {
    compression: 'STORE',
    createFolders: false,
  });

  // Add all other files with DEFLATE compression
  for (const [filePath, content] of files) {
    if (filePath === 'mimetype') continue;
    zip.file(filePath, content, { compression: 'DEFLATE' });
  }

  const buffer = await zip.generateAsync({
    type: 'nodebuffer',
    compression: 'DEFLATE',
    compressionOptions: { level: 9 },
  });

  await fs.writeFile(outputPath, buffer);
}

export function buildMimetype(): Buffer {
  return Buffer.from('application/epub+zip', 'utf8');
}

export function buildContainerXml(opfPath: string): Buffer {
  const xml = `<?xml version='1.0' encoding='UTF-8'?>
<container xmlns="urn:oasis:names:tc:opendocument:xmlns:container" version="1.0">
  <rootfiles>
    <rootfile full-path="${opfPath}" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`;
  return Buffer.from(xml, 'utf8');
}
