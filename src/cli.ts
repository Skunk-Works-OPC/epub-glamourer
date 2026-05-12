#!/usr/bin/env node
import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import * as path from 'path';
import * as fs from 'fs-extra';
import { run } from './router.js';
import { validate } from './validator.js';
import { preview } from './previewer.js';
import { unpack } from './unpacker.js';
import { getExtractor } from './extractors/index.js';
import { extractDirectory, isDirectoryInput } from './extractors/directory.js';
import type { GlamourOptions } from './types/pipeline.js';

const pkg = require('../package.json') as { version: string; description: string };

const program = new Command();

program
  .name('epub-glamour')
  .description(`${pkg.description}

Primary:   build a new EPUB from a directory of chapters (with metadata.json)
           or from a single source file (.md, .html, .txt, .docx, .pdf).
Secondary: re-skin an existing .epub with the glamour stylesheet.`)
  .version(pkg.version)
  .argument('<input>', 'Directory of chapters, single source file, or existing .epub')
  .option('-o, --output <path>', 'Output file path (default: <input>.epub or <input>-glamoured.epub)')
  .option('-c, --cover <path>', 'Cover image (JPG/PNG/SVG). Otherwise tries OpenLibrary, then generated SVG.')
  .option('--no-online-cover', 'Skip OpenLibrary cover lookup (always use SVG fallback if no --cover)')
  .option('-p, --preview', 'Open HTML preview before packaging', false)
  .option('--preview-port <n>', 'Preview server port', '3456')
  .option('--no-validate', 'Skip EPUB validation after packaging')
  .option('--keep-css', 'Re-skin only: do not suppress original stylesheets', false)
  .option('--strip-pg', 'Re-skin only: hide Project Gutenberg boilerplate sections', false)
  .option('-v, --verbose', 'Verbose logging', false)
  .action(async (inputArg: string, cmdOpts: Record<string, unknown>) => {
    const inputPath = path.resolve(inputArg);

    if (!await fs.pathExists(inputPath)) {
      console.error(chalk.red(`\n  Error: File not found: ${inputPath}\n`));
      process.exit(1);
    }

    const opts: GlamourOptions = {
      preview: Boolean(cmdOpts.preview),
      previewPort: parseInt(String(cmdOpts.previewPort ?? 3456), 10),
      validate: cmdOpts.validate !== false,
      keepOriginalCss: Boolean(cmdOpts.keepCss),
      stripPgBoilerplate: Boolean(cmdOpts.stripPg),
      outputPath: cmdOpts.output ? path.resolve(String(cmdOpts.output)) : undefined,
      coverPath: cmdOpts.cover ? path.resolve(String(cmdOpts.cover)) : undefined,
      onlineCoverLookup: cmdOpts.onlineCover !== false,
      verbose: Boolean(cmdOpts.verbose),
    };

    console.log(chalk.bold(`\n  epub-glamourer\n`));
    console.log(chalk.dim(`  Input:  ${inputPath}`));

    // Preview pass — load content without packing
    if (opts.preview) {
      const previewSpinner = ora({ text: 'Loading content for preview…', color: 'yellow' }).start();
      try {
        const chapters = await loadChaptersForPreview(inputPath, opts);
        previewSpinner.succeed('Content loaded');
        await preview(chapters, path.basename(inputPath, path.extname(inputPath)), opts.previewPort);
      } catch (err: unknown) {
        previewSpinner.fail('Preview failed');
        const message = err instanceof Error ? err.message : String(err);
        console.error(chalk.red(`  ${message}`));
        if (opts.verbose && err instanceof Error && err.stack) console.error(err.stack);
      }
    }

    // Pack
    const packSpinner = ora({ text: 'Glamouring and packaging…', color: 'cyan' }).start();
    let outputPath: string;

    try {
      outputPath = await run(inputPath, opts);
      packSpinner.succeed(chalk.green('Packaged successfully'));
    } catch (err: unknown) {
      packSpinner.fail('Packaging failed');
      const message = err instanceof Error ? err.message : String(err);
      console.error(chalk.red(`\n  Error: ${message}\n`));
      if (opts.verbose && err instanceof Error && err.stack) console.error(err.stack);
      process.exit(1);
    }

    console.log(chalk.dim(`  Output: ${outputPath}`));

    // Validate
    if (opts.validate) {
      const valSpinner = ora({ text: 'Validating EPUB…', color: 'blue' }).start();
      try {
        const result = await validate(outputPath);
        if (result.valid) {
          valSpinner.succeed(chalk.green(`Valid EPUB (${result.method})`));
        } else {
          valSpinner.warn(chalk.yellow(`Validation warnings (${result.method})`));
        }
        if (result.errors.length > 0) {
          console.error(chalk.red('\n  Errors:'));
          for (const e of result.errors) console.error(chalk.red(`    ✖ ${e}`));
        }
        if (result.warnings.length > 0 && opts.verbose) {
          console.warn(chalk.yellow('\n  Warnings:'));
          for (const w of result.warnings) console.warn(chalk.yellow(`    ⚠ ${w}`));
        }
      } catch (err: unknown) {
        valSpinner.warn('Validation skipped (error)');
        if (opts.verbose) console.error(err);
      }
    }

    const stat = await fs.stat(outputPath);
    const kb = (stat.size / 1024).toFixed(1);
    console.log(chalk.bold.green(`\n  ✓ Done! ${path.basename(outputPath)} (${kb} KB)\n`));
  });

program.parse();

async function loadChaptersForPreview(
  inputPath: string,
  opts: GlamourOptions
): Promise<import('./previewer.js').PreviewChapter[]> {
  if (await isDirectoryInput(inputPath)) {
    const { chapters } = await extractDirectory(inputPath, opts);
    return chapters.map((c) => ({ id: c.id, filename: c.filename, title: c.title, xhtmlContent: c.xhtmlContent }));
  }

  const ext = path.extname(inputPath).toLowerCase();

  if (ext === '.epub') {
    const { epubPackage, files } = await unpack(inputPath);
    const { manifest, spine, opfDir } = epubPackage;
    const manifestById = new Map(manifest.map((item) => [item.id, item]));
    const chapters: import('./previewer.js').PreviewChapter[] = [];
    for (const spineItem of spine) {
      const item = manifestById.get(spineItem.idref);
      if (!item || item.mediaType !== 'application/xhtml+xml') continue;
      const buf = files.get(`${opfDir}/${item.href}`);
      if (!buf) continue;
      chapters.push({ id: item.id, filename: item.href, title: item.id, xhtmlContent: buf.toString('utf8') });
    }
    return chapters;
  }

  const extractor = getExtractor(inputPath);
  if (!extractor) throw new Error(`Unsupported format: ${ext}`);

  const { chapters } = await extractor(inputPath, opts);
  return chapters.map((c) => ({ id: c.id, filename: c.filename, title: c.title, xhtmlContent: c.xhtmlContent }));
}
