import { v4 as uuidv4 } from 'uuid';
import type { EpubMetadata } from './types/epub.js';

export function generateIdentifier(): string {
  return `urn:uuid:${uuidv4()}`;
}

export function nowIso(): string {
  return new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
}

export function buildMetadata(partial: Partial<EpubMetadata>): EpubMetadata {
  return {
    title: partial.title ?? 'Untitled',
    author: partial.author ?? 'Unknown',
    language: partial.language ?? 'en',
    identifier: partial.identifier ?? generateIdentifier(),
    modified: partial.modified ?? nowIso(),
    subject: partial.subject,
    publisher: partial.publisher,
    date: partial.date,
    rights: partial.rights,
    description: partial.description,
    coverImagePath: partial.coverImagePath,
  };
}

export function mergeMetadata(base: EpubMetadata, overrides: Partial<EpubMetadata>): EpubMetadata {
  return {
    ...base,
    ...Object.fromEntries(
      Object.entries(overrides).filter(([, v]) => v !== undefined && v !== '')
    ),
    modified: nowIso(),
  } as EpubMetadata;
}
