import * as path from 'path';
import * as fs from 'fs-extra';
import * as os from 'os';
import { extractDirectory, isDirectoryInput } from '../../../src/extractors/directory';
import { DEFAULT_OPTIONS } from '../../../src/types/pipeline';

describe('extractDirectory', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'epub-glamourer-dir-test-'));
  });

  afterEach(async () => {
    await fs.remove(tmpDir);
  });

  it('reads metadata.json and chapter markdown files in sorted order', async () => {
    await fs.writeJson(path.join(tmpDir, 'metadata.json'), {
      title: 'Test Book',
      author: 'Test Author',
      publisher: 'Test Press',
      language: 'en',
    });
    await fs.writeFile(path.join(tmpDir, 'chapter-002.md'), '# Second\n\nSecond chapter.');
    await fs.writeFile(path.join(tmpDir, 'chapter-001.md'), '# First\n\nFirst chapter.');

    const result = await extractDirectory(tmpDir, DEFAULT_OPTIONS);
    expect(result.metadata.title).toBe('Test Book');
    expect(result.metadata.author).toBe('Test Author');
    expect(result.metadata.publisher).toBe('Test Press');
    expect(result.chapters).toHaveLength(2);
    expect(result.chapters[0].title).toBe('First');
    expect(result.chapters[1].title).toBe('Second');
    expect(result.chapters[0].id).toBe('chapter-001');
    expect(result.chapters[1].id).toBe('chapter-002');
  });

  it('handles mixed file formats (md + html + txt)', async () => {
    await fs.writeJson(path.join(tmpDir, 'metadata.json'), { title: 'Mixed', author: 'A', language: 'en' });
    await fs.writeFile(path.join(tmpDir, 'chapter-001.md'), '# Markdown\n\nMD content.');
    await fs.writeFile(path.join(tmpDir, 'chapter-002.html'), '<html><body><h1>HTML</h1><p>HTML content.</p></body></html>');
    await fs.writeFile(path.join(tmpDir, 'chapter-003.txt'), 'CHAPTER III\n\nText content.');

    const result = await extractDirectory(tmpDir, DEFAULT_OPTIONS);
    expect(result.chapters.length).toBeGreaterThanOrEqual(3);
  });

  it('throws when no chapter files are found', async () => {
    await fs.writeJson(path.join(tmpDir, 'metadata.json'), { title: 'Empty', author: 'A', language: 'en' });
    await expect(extractDirectory(tmpDir, DEFAULT_OPTIONS)).rejects.toThrow(/No chapter source files/);
  });

  it('collects images from /images subfolder', async () => {
    await fs.writeJson(path.join(tmpDir, 'metadata.json'), { title: 'WithImages', author: 'A', language: 'en' });
    await fs.writeFile(path.join(tmpDir, 'chapter-001.md'), '# C1\n\nHas image.');
    await fs.ensureDir(path.join(tmpDir, 'images'));
    await fs.writeFile(path.join(tmpDir, 'images', 'figure-1.png'), Buffer.from([0x89, 0x50, 0x4e, 0x47]));

    const result = await extractDirectory(tmpDir, DEFAULT_OPTIONS);
    expect(result.images.has('figure-1.png')).toBe(true);
  });

  it('isDirectoryInput returns true for directories, false for files', async () => {
    expect(await isDirectoryInput(tmpDir)).toBe(true);
    const f = path.join(tmpDir, 'f.txt');
    await fs.writeFile(f, 'x');
    expect(await isDirectoryInput(f)).toBe(false);
    expect(await isDirectoryInput('/no/such/path')).toBe(false);
  });

  it('metadata.json overrides front matter from chapter files', async () => {
    await fs.writeJson(path.join(tmpDir, 'metadata.json'), { title: 'Override Title', author: 'Override Author', language: 'en' });
    await fs.writeFile(path.join(tmpDir, 'chapter-001.md'), `---
title: Front Matter Title
author: Front Matter Author
---

# Chapter

Content.`);

    const result = await extractDirectory(tmpDir, DEFAULT_OPTIONS);
    expect(result.metadata.title).toBe('Override Title');
    expect(result.metadata.author).toBe('Override Author');
  });
});
