import * as path from 'path';
import * as fs from 'fs-extra';
import * as os from 'os';
import JSZip from 'jszip';
import { run } from '../../src/router';
import { validateStructural } from '../../src/validator';
import { DEFAULT_OPTIONS } from '../../src/types/pipeline';

const REFERENCE_SRC = path.join(__dirname, '..', '..', 'reference', 'src');

describe('Build pipeline from directory (primary use case)', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'epub-glamourer-build-int-'));
  });

  afterEach(async () => {
    await fs.remove(tmpDir);
  });

  it('builds a valid EPUB3 from reference/src/ directory', async () => {
    const outputPath = path.join(tmpDir, 'model-from-dir.epub');
    const result = await run(REFERENCE_SRC, { ...DEFAULT_OPTIONS, outputPath });

    expect(result).toBe(outputPath);
    expect(await fs.pathExists(outputPath)).toBe(true);

    const data = await fs.readFile(outputPath);
    const zip = await JSZip.loadAsync(data);

    expect(zip.file('mimetype')).not.toBeNull();
    expect(zip.file('OEBPS/cover.xhtml')).not.toBeNull();
    expect(zip.file('OEBPS/title-page.xhtml')).not.toBeNull();
    expect(zip.file('OEBPS/copyright.xhtml')).not.toBeNull();
    expect(zip.file('OEBPS/toc.xhtml')).not.toBeNull();
    expect(zip.file('OEBPS/toc.ncx')).not.toBeNull();
    expect(zip.file('OEBPS/main.css')).not.toBeNull();
    expect(zip.file('OEBPS/fonts/Lora-Regular.ttf')).not.toBeNull();
    expect(zip.file('OEBPS/chapter-001.xhtml')).not.toBeNull();
    expect(zip.file('OEBPS/chapter-002.xhtml')).not.toBeNull();
    expect(zip.file('OEBPS/chapter-003.xhtml')).not.toBeNull();
  });

  it('output passes structural validation', async () => {
    const outputPath = path.join(tmpDir, 'validated.epub');
    await run(REFERENCE_SRC, { ...DEFAULT_OPTIONS, outputPath });
    const result = await validateStructural(outputPath);
    expect(result.errors).toHaveLength(0);
  });

  it('metadata from metadata.json is propagated into the OPF', async () => {
    const outputPath = path.join(tmpDir, 'meta.epub');
    await run(REFERENCE_SRC, { ...DEFAULT_OPTIONS, outputPath });
    const zip = await JSZip.loadAsync(await fs.readFile(outputPath));
    const opf = await zip.file('OEBPS/content.opf')!.async('string');
    expect(opf).toContain('<dc:title>The Glamour Model</dc:title>');
    expect(opf).toContain('<dc:creator>epub-glamourer</dc:creator>');
    expect(opf).toContain('<dc:publisher>epub-glamourer Project</dc:publisher>');
  });

  it('spine order: cover(linear=no) → title-page → copyright → toc → chapters', async () => {
    const outputPath = path.join(tmpDir, 'spine.epub');
    await run(REFERENCE_SRC, { ...DEFAULT_OPTIONS, outputPath });
    const zip = await JSZip.loadAsync(await fs.readFile(outputPath));
    const opf = await zip.file('OEBPS/content.opf')!.async('string');

    const spineMatch = opf.match(/<spine[^>]*>([\s\S]*?)<\/spine>/);
    expect(spineMatch).not.toBeNull();
    const spine = spineMatch![1];

    const order = ['cover', 'title-page', 'copyright', 'toc-nav', 'chapter-001', 'chapter-002', 'chapter-003'];
    let lastIdx = -1;
    for (const idref of order) {
      const idx = spine.indexOf(`idref="${idref}"`);
      expect(idx).toBeGreaterThan(lastIdx);
      lastIdx = idx;
    }

    expect(spine).toMatch(/<itemref[^>]*idref="cover"[^>]*linear="no"/);
  });

  it('--cover overrides the auto-generated SVG with user image', async () => {
    // Make a 1x1 PNG
    const pngBytes = Buffer.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
      0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
      0x08, 0x02, 0x00, 0x00, 0x00, 0x90, 0x77, 0x53, 0xde,
    ]);
    const coverPath = path.join(tmpDir, 'my-cover.png');
    await fs.writeFile(coverPath, pngBytes);

    const outputPath = path.join(tmpDir, 'custom-cover.epub');
    await run(REFERENCE_SRC, { ...DEFAULT_OPTIONS, outputPath, coverPath });

    const zip = await JSZip.loadAsync(await fs.readFile(outputPath));
    expect(zip.file('OEBPS/images/cover.png')).not.toBeNull();
    expect(zip.file('OEBPS/images/cover.svg')).toBeNull();

    const opf = await zip.file('OEBPS/content.opf')!.async('string');
    expect(opf).toContain('href="images/cover.png"');
    expect(opf).toContain('media-type="image/png"');
  });
});
