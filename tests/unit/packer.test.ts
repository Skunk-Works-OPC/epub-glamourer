import * as path from 'path';
import * as fs from 'fs-extra';
import * as os from 'os';
import JSZip from 'jszip';
import { pack, buildMimetype, buildContainerXml } from '../../src/packer';

describe('packer', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'epub-glamourer-test-'));
  });

  afterEach(async () => {
    await fs.remove(tmpDir);
  });

  it('produces a ZIP with mimetype as first entry', async () => {
    const files = new Map<string, Buffer>();
    files.set('mimetype', buildMimetype());
    files.set('META-INF/container.xml', buildContainerXml('OEBPS/content.opf'));
    files.set('OEBPS/content.opf', Buffer.from('<package/>', 'utf8'));

    const outputPath = path.join(tmpDir, 'test.epub');
    await pack(files, outputPath);

    const data = await fs.readFile(outputPath);
    const zip = await JSZip.loadAsync(data);

    const mimetypeFile = zip.file('mimetype');
    expect(mimetypeFile).not.toBeNull();

    const content = await mimetypeFile!.async('string');
    expect(content.trim()).toBe('application/epub+zip');
  });

  it('includes all provided files in the output', async () => {
    const files = new Map<string, Buffer>();
    files.set('mimetype', buildMimetype());
    files.set('META-INF/container.xml', Buffer.from('<container/>', 'utf8'));
    files.set('OEBPS/toc.xhtml', Buffer.from('<html/>', 'utf8'));

    const outputPath = path.join(tmpDir, 'test2.epub');
    await pack(files, outputPath);

    const zip = await JSZip.loadAsync(await fs.readFile(outputPath));
    expect(zip.file('META-INF/container.xml')).not.toBeNull();
    expect(zip.file('OEBPS/toc.xhtml')).not.toBeNull();
  });

  it('buildMimetype returns correct content', () => {
    expect(buildMimetype().toString('utf8')).toBe('application/epub+zip');
  });

  it('buildContainerXml includes the opf path', () => {
    const xml = buildContainerXml('OEBPS/content.opf').toString('utf8');
    expect(xml).toContain('full-path="OEBPS/content.opf"');
    expect(xml).toContain('application/oebps-package+xml');
  });
});
