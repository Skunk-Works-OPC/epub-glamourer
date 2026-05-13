import type { EpubMetadata } from './epub.js';

export interface ExtractedChapter {
  id: string;
  filename: string;
  title: string;
  xhtmlContent: string;
  order: number;
  epubType?: string;
}

export interface GlamourOptions {
  preview: boolean;
  previewPort: number;
  validate: boolean;
  keepOriginalCss: boolean;
  stripPgBoilerplate: boolean;
  eStoryaClassics: boolean;
  outputPath?: string;
  coverPath?: string;
  onlineCoverLookup: boolean;
  verbose: boolean;
}

export interface PipelineContext {
  inputPath: string;
  outputPath: string;
  tempDir: string;
  metadata: EpubMetadata;
  chapters: ExtractedChapter[];
  images: Map<string, Buffer>;
  existingCssIds: string[];
  options: GlamourOptions;
}

export interface ExtractResult {
  chapters: ExtractedChapter[];
  metadata: Partial<EpubMetadata>;
  images: Map<string, Buffer>;
  isPictureBook?: boolean;
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  method: 'epubcheck' | 'structural';
}

export const DEFAULT_OPTIONS: GlamourOptions = {
  preview: false,
  previewPort: 3456,
  validate: true,
  keepOriginalCss: false,
  stripPgBoilerplate: false,
  eStoryaClassics: false,
  onlineCoverLookup: true,
  verbose: false,
};
