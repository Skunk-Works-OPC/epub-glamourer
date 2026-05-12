import * as path from 'path';
import * as fs from 'fs-extra';
import * as os from 'os';
import { extractMarkdown } from '../../../src/extractors/markdown';
import { DEFAULT_OPTIONS } from '../../../src/types/pipeline';

describe('extractMarkdown', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'epub-glamourer-md-test-'));
  });

  afterEach(async () => {
    await fs.remove(tmpDir);
  });

  it('extracts title from H1', async () => {
    const mdPath = path.join(tmpDir, 'test.md');
    await fs.writeFile(mdPath, '# My Title\n\nSome content here.');
    const result = await extractMarkdown(mdPath, DEFAULT_OPTIONS);
    expect(result.metadata.title).toBe('My Title');
  });

  it('parses YAML front matter', async () => {
    const mdPath = path.join(tmpDir, 'fm.md');
    await fs.writeFile(mdPath, `---
title: Front Matter Title
author: Test Author
lang: fr
---

# Chapter One

Content here.`);
    const result = await extractMarkdown(mdPath, DEFAULT_OPTIONS);
    expect(result.metadata.title).toBe('Front Matter Title');
    expect(result.metadata.author).toBe('Test Author');
    expect(result.metadata.language).toBe('fr');
  });

  it('splits on multiple H1 headings', async () => {
    const mdPath = path.join(tmpDir, 'multi.md');
    await fs.writeFile(mdPath, `# Chapter One\n\nContent one.\n\n# Chapter Two\n\nContent two.`);
    const result = await extractMarkdown(mdPath, DEFAULT_OPTIONS);
    expect(result.chapters.length).toBe(2);
    expect(result.chapters[0].title).toBe('Chapter One');
    expect(result.chapters[1].title).toBe('Chapter Two');
  });

  it('produces valid XHTML output', async () => {
    const mdPath = path.join(tmpDir, 'xhtml.md');
    await fs.writeFile(mdPath, '# Test\n\nA paragraph.');
    const result = await extractMarkdown(mdPath, DEFAULT_OPTIONS);
    const xhtml = result.chapters[0].xhtmlContent;
    expect(xhtml).toContain('xmlns="http://www.w3.org/1999/xhtml"');
    expect(xhtml).toContain('epub:type="chapter"');
  });
});
