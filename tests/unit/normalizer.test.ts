import { sanitizeNcName, escapeXml, injectCssLink, normalizeXhtml } from '../../src/normalizer';

describe('sanitizeNcName', () => {
  it('returns valid NCName unchanged', () => {
    expect(sanitizeNcName('chapter-001')).toBe('chapter-001');
  });

  it('prefixes digit-starting IDs', () => {
    expect(sanitizeNcName('1abc')).toBe('id-1abc');
  });

  it('replaces spaces with hyphens', () => {
    expect(sanitizeNcName('my chapter')).toBe('my-chapter');
  });

  it('handles empty string', () => {
    expect(sanitizeNcName('')).toBe('id-empty');
  });
});

describe('escapeXml', () => {
  it('escapes all XML special chars', () => {
    expect(escapeXml('<a>&"\'</a>')).toBe('&lt;a&gt;&amp;&quot;&apos;&lt;/a&gt;');
  });

  it('leaves safe strings unchanged', () => {
    expect(escapeXml('Hello World')).toBe('Hello World');
  });
});

describe('injectCssLink', () => {
  const minimalXhtml = `<?xml version='1.0' encoding='UTF-8'?>
<html xmlns="http://www.w3.org/1999/xhtml" xml:lang="en">
<head><title>Test</title></head>
<body><p>Hello</p></body>
</html>`;

  it('injects a link tag into <head>', () => {
    const result = injectCssLink(minimalXhtml, 'main.css');
    expect(result).toContain('<link href="main.css"');
    expect(result).toContain('rel="stylesheet"');
  });

  it('does not duplicate existing main.css link', () => {
    const withLink = injectCssLink(minimalXhtml, 'main.css');
    const again = injectCssLink(withLink, 'main.css');
    const matches = (again.match(/href="main\.css"/g) ?? []).length;
    expect(matches).toBe(1);
  });
});

describe('normalizeXhtml', () => {
  it('strips script tags', () => {
    const html = '<html><head><title>T</title></head><body><script>alert(1)</script><p>Text</p></body></html>';
    const result = normalizeXhtml(html);
    expect(result).not.toContain('<script');
    expect(result).toContain('<p>Text</p>');
  });

  it('adds alt attribute to img without one', () => {
    const html = '<html><head><title>T</title></head><body><img src="a.png"/></body></html>';
    const result = normalizeXhtml(html);
    expect(result).toContain('alt=""');
  });
});
