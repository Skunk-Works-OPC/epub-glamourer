import * as path from 'path';
import * as fs from 'fs-extra';
import * as os from 'os';
import { extractTxt } from '../../../src/extractors/txt';
import { DEFAULT_OPTIONS } from '../../../src/types/pipeline';

describe('extractTxt', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'epub-glamourer-txt-test-'));
  });

  afterEach(async () => {
    await fs.remove(tmpDir);
  });

  it('produces at least one chapter from plain text', async () => {
    const txtPath = path.join(tmpDir, 'sample.txt');
    await fs.writeFile(txtPath, 'My Great Story\n\nOnce upon a time, there was a paragraph.\n\nAnother paragraph follows here.');
    const result = await extractTxt(txtPath, DEFAULT_OPTIONS);
    expect(result.chapters.length).toBeGreaterThan(0);
    expect(result.chapters[0].xhtmlContent).toContain('Once upon a time');
  });

  it('splits on CHAPTER headings', async () => {
    const txtPath = path.join(tmpDir, 'chapters.txt');
    const content = [
      'Introduction text here.',
      '',
      'CHAPTER I',
      '',
      'First chapter content.',
      '',
      'CHAPTER II',
      '',
      'Second chapter content.',
    ].join('\n');
    await fs.writeFile(txtPath, content);
    const result = await extractTxt(txtPath, DEFAULT_OPTIONS);
    expect(result.chapters.length).toBeGreaterThanOrEqual(2);
  });

  it('returns valid XHTML with proper xml declaration', async () => {
    const txtPath = path.join(tmpDir, 'simple.txt');
    await fs.writeFile(txtPath, 'Hello world.\n\nA second paragraph.');
    const result = await extractTxt(txtPath, DEFAULT_OPTIONS);
    const xhtml = result.chapters[0].xhtmlContent;
    expect(xhtml).toContain("<?xml version='1.0' encoding='UTF-8'?>");
    expect(xhtml).toContain('xmlns="http://www.w3.org/1999/xhtml"');
    expect(xhtml).toContain('epub:type="chapter"');
  });

  it('returns no images', async () => {
    const txtPath = path.join(tmpDir, 'noimg.txt');
    await fs.writeFile(txtPath, 'Just text.');
    const result = await extractTxt(txtPath, DEFAULT_OPTIONS);
    expect(result.images.size).toBe(0);
  });
});
