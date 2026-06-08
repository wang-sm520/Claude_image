#!/usr/bin/env node

import { randomUUID } from 'node:crypto';
import { realpathSync } from 'node:fs';
import { copyFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Command } from 'commander';
import { configStore } from '../lib/config.js';
import { editImage, generateImage } from '../lib/imageService.js';
import { paths } from '../lib/paths.js';

function printJson(value) {
  console.log(JSON.stringify(value, null, 2));
}

function buildRequest(prompt, options) {
  return {
    prompt,
    model: options.model,
    size: options.size,
    quality: options.quality
  };
}

function safeExtension(filePath) {
  const extension = path.extname(filePath).toLowerCase();
  return /^\.[a-z0-9]+$/.test(extension) ? extension : '';
}

async function buildConfigUpdate(options) {
  const apiKey = typeof options.apiKey === 'string' ? options.apiKey.trim() : '';
  const nextConfig = {
    baseUrl: options.baseUrl,
    model: options.model,
    size: options.size,
    quality: options.quality
  };

  if (apiKey) {
    return { ...nextConfig, apiKey };
  }

  const currentConfig = await configStore.readConfig();
  return { ...nextConfig, apiKey: currentConfig.apiKey };
}

async function copyImageToUploadDir(imagePath) {
  await mkdir(paths.uploadDir, { recursive: true });
  const sourcePath = path.resolve(imagePath);
  const copiedPath = path.join(paths.uploadDir, `${randomUUID()}${safeExtension(sourcePath)}`);
  await copyFile(sourcePath, copiedPath);
  return copiedPath;
}

export function createProgram() {
  const program = new Command();

  program
    .name('image-console')
    .description('Local image generation console')
    .version('0.1.0');

  program
    .command('config')
    .description('Show safe local API config')
    .action(async () => {
      printJson(await configStore.readSafeConfig());
    });

  program
    .command('set-config')
    .description('Save local API config')
    .requiredOption('--base-url <url>', 'API base URL')
    .option('--api-key <key>', 'API key')
    .option('--model <model>', 'Image model', 'gpt-image-2')
    .option('--size <size>', 'Image size', '1024x1024')
    .option('--quality <quality>', 'Image quality', 'medium')
    .action(async (options) => {
      await configStore.writeConfig(await buildConfigUpdate(options));
      printJson(await configStore.readSafeConfig());
    });

  program
    .command('generate')
    .description('Generate an image')
    .argument('<prompt>', 'Image prompt')
    .option('--model <model>', 'Image model')
    .option('--size <size>', 'Image size')
    .option('--quality <quality>', 'Image quality')
    .action(async (prompt, options) => {
      const item = await generateImage(buildRequest(prompt, options));
      console.log(item.outputPath);
    });

  program
    .command('edit')
    .description('Edit an image')
    .requiredOption('--image <path>', 'Local image path')
    .requiredOption('--prompt <prompt>', 'Edit prompt')
    .option('--model <model>', 'Image model')
    .option('--size <size>', 'Image size')
    .option('--quality <quality>', 'Image quality')
    .action(async (options) => {
      const copiedPath = await copyImageToUploadDir(options.image);
      const item = await editImage({
        ...buildRequest(options.prompt, options),
        imagePath: copiedPath
      });
      console.log(item.outputPath);
    });

  return program;
}

async function main() {
  const program = createProgram();

  try {
    await program.parseAsync(process.argv);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

const currentFilePath = realpathSync(fileURLToPath(import.meta.url));
if (process.argv[1] && realpathSync(path.resolve(process.argv[1])) === currentFilePath) {
  main();
}
