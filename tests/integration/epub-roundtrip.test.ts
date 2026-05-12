import * as path from 'path';
import * as fs from 'fs-extra';
import * as os from 'os';
import JSZip from 'jszip';
import { unpack } from '../../src/unpacker';
import { pack } from '../../src/packer';
import { glamourFiles } from '../../src/glamourer';
import { validateStructural } from '../../src/validator';
import { DEFAULT_OPTIONS } from '../../src/types/pipeline';

const MODEL_EPUB = path.join(__dirname, '..', '..', 'reference', 'model.epub');

describe('EPUB roundtrip (model.epub)', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'epub-glamourer-int-'));
  });

  afterEach(async () => {
    await fs.remove(tmpDir);
  });

  it('model.epub exists and is a valid ZIP', async () => {
    expect(await fs.pathExists(MODEL_EPUB)).toBe(true);
    const data = await fs.readFile(MODEL_EPUB);
    const zip = await JSZip.loadAsync(data);
    const mimetypeFile = zip.file('mimetype');
    expect(mimetypeFile).not.toBeNull();
    const content = await mimetypeFile!.async('string');
    expect(content.trim()).toBe('application/epub+zip');
  });

  it('can unpack model.epub and read metadata', async () => {
    const { epubPackage } = await unpack(MODEL_EPUB);
    expect(epubPackage.metadata.title).toBe('The Glamour Model');
    expect(epubPackage.metadata.author).toBe('epub-glamourer');
    expect(epubPackage.metadata.language).toBe('en');
    expect(epubPackage.spine.length).toBeGreaterThan(3);
  });

  it('model.epub has required spine structure', async () => {
    const { epubPackage } = await unpack(MODEL_EPUB);
    const { manifest, spine } = epubPackage;
    const manifestById = new Map(manifest.map((m) => [m.id, m]));

    const spineHrefs = spine.map((s) => manifestById.get(s.idref)?.href ?? '');

    expect(spineHrefs).toContain('cover.xhtml');
    expect(spineHrefs).toContain('title-page.xhtml');
    expect(spineHrefs).toContain('copyright.xhtml');
    expect(spineHrefs).toContain('toc.xhtml');

    // cover must be linear="no"
    const coverSpine = spine.find((s) => manifestById.get(s.idref)?.href === 'cover.xhtml');
    expect(coverSpine?.linear).toBe('no');
  });

  it('model.epub has nav document with landmarks', async () => {
    const { files } = await unpack(MODEL_EPUB);
    const tocBuf = files.get('OEBPS/toc.xhtml');
    expect(tocBuf).toBeDefined();
    const toc = tocBuf!.toString('utf8');
    expect(toc).toContain('epub:type="toc"');
    expect(toc).toContain('landmarks');
    expect(toc).toContain('bodymatter');
    expect(toc).toContain('cover');
  });

  it('glamouring model.epub produces a valid output with main.css', async () => {
    const { epubPackage, files } = await unpack(MODEL_EPUB);
    const opts = { ...DEFAULT_OPTIONS };
    const { files: glamouredFiles } = await glamourFiles(files, epubPackage, opts);

    const outputPath = path.join(tmpDir, 'model-glamoured.epub');
    await pack(glamouredFiles, outputPath);

    expect(await fs.pathExists(outputPath)).toBe(true);

    // Check main.css is in the glamoured epub
    const data = await fs.readFile(outputPath);
    const zip = await JSZip.loadAsync(data);
    expect(zip.file('OEBPS/main.css')).not.toBeNull();
    expect(zip.file('OEBPS/fonts/Lora-Regular.ttf')).not.toBeNull();
  });

  it('structural validation passes for model.epub', async () => {
    const result = await validateStructural(MODEL_EPUB);
    expect(result.method).toBe('structural');
    expect(result.errors).toHaveLength(0);
  });

  it('structural validation passes for glamoured output', async () => {
    const { epubPackage, files } = await unpack(MODEL_EPUB);
    const { files: glamouredFiles } = await glamourFiles(files, epubPackage, DEFAULT_OPTIONS);
    const outputPath = path.join(tmpDir, 'glamoured.epub');
    await pack(glamouredFiles, outputPath);

    const result = await validateStructural(outputPath);
    expect(result.errors).toHaveLength(0);
  });
});
