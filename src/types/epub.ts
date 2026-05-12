export interface EpubMetadata {
  title: string;
  author: string;
  language: string;
  identifier: string;
  modified: string;
  subject?: string;
  publisher?: string;
  date?: string;
  rights?: string;
  description?: string;
  coverImagePath?: string;
}

export interface ManifestItem {
  id: string;
  href: string;
  mediaType: string;
  properties?: string;
}

export interface SpineItem {
  idref: string;
  linear?: 'yes' | 'no';
}

export interface EpubPackage {
  metadata: EpubMetadata;
  manifest: ManifestItem[];
  spine: SpineItem[];
  opfPath: string;
  opfDir: string;
}

export const MEDIA_TYPES = {
  XHTML: 'application/xhtml+xml',
  NCX: 'application/x-dtbncx+xml',
  OPF: 'application/oebps-package+xml',
  CSS: 'text/css',
  FONT_TTF: 'application/font-sfnt',
  FONT_OTF: 'application/font-sfnt',
  FONT_WOFF: 'application/font-woff',
  FONT_WOFF2: 'font/woff2',
  IMAGE_JPEG: 'image/jpeg',
  IMAGE_PNG: 'image/png',
  IMAGE_GIF: 'image/gif',
  IMAGE_SVG: 'image/svg+xml',
  IMAGE_WEBP: 'image/webp',
} as const;

export function mediaTypeFromExtension(ext: string): string {
  const map: Record<string, string> = {
    '.xhtml': MEDIA_TYPES.XHTML,
    '.html': MEDIA_TYPES.XHTML,
    '.htm': MEDIA_TYPES.XHTML,
    '.css': MEDIA_TYPES.CSS,
    '.ttf': MEDIA_TYPES.FONT_TTF,
    '.otf': MEDIA_TYPES.FONT_OTF,
    '.woff': MEDIA_TYPES.FONT_WOFF,
    '.woff2': MEDIA_TYPES.FONT_WOFF2,
    '.jpg': MEDIA_TYPES.IMAGE_JPEG,
    '.jpeg': MEDIA_TYPES.IMAGE_JPEG,
    '.png': MEDIA_TYPES.IMAGE_PNG,
    '.gif': MEDIA_TYPES.IMAGE_GIF,
    '.svg': MEDIA_TYPES.IMAGE_SVG,
    '.webp': MEDIA_TYPES.IMAGE_WEBP,
    '.ncx': MEDIA_TYPES.NCX,
  };
  return map[ext.toLowerCase()] ?? 'application/octet-stream';
}
