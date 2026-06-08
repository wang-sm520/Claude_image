import { randomUUID } from 'node:crypto';
import { mkdir, open, realpath, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { configStore } from './config.js';
import { historyStore } from './history.js';
import { callEditApi, callGenerateApi } from './imageApi.js';
import { paths } from './paths.js';

const INVALID_EDIT_INPUT_MESSAGE = 'Edit input must be a PNG, JPEG, GIF, or WebP image.';
const INVALID_EDIT_SOURCE_MESSAGE = 'Edit input must come from the local upload directory.';

function createId() {
  return `${new Date().toISOString().replace(/[:.]/g, '-')}-${randomUUID()}`;
}

function ensureConfigured(config) {
  if (!config.baseUrl || !config.apiKey) {
    throw new Error('Missing API configuration. Save base URL and API key first.');
  }
}

function withDefaults(config, request) {
  return {
    model: request.model || config.model,
    size: request.size || config.size,
    quality: request.quality || config.quality,
    prompt: request.prompt
  };
}

async function appendFailedHistoryOrAnnotate(error, item) {
  try {
    const historyItem = await historyStore.appendHistory(item);
    error.historyItem = historyItem;
  } catch (historyError) {
    error.historyError = historyError;
  }

  throw error;
}

async function saveImage(buffer, id) {
  await mkdir(paths.imageDir, { recursive: true });
  const fileName = `${id}.png`;
  const outputPath = path.join(paths.imageDir, fileName);
  await writeFile(outputPath, buffer);
  return { fileName, outputPath };
}

function isPathInside(parentPath, childPath) {
  const relativePath = path.relative(parentPath, childPath);
  return relativePath === '' || (!relativePath.startsWith('..') && !path.isAbsolute(relativePath));
}

async function detectImageMimeType(filePath) {
  const file = await open(filePath, 'r');

  try {
    const header = Buffer.alloc(12);
    const { bytesRead } = await file.read(header, 0, header.length, 0);
    const bytes = header.subarray(0, bytesRead);

    const isPng = bytes.length >= 8
      && bytes[0] === 0x89
      && bytes[1] === 0x50
      && bytes[2] === 0x4e
      && bytes[3] === 0x47
      && bytes[4] === 0x0d
      && bytes[5] === 0x0a
      && bytes[6] === 0x1a
      && bytes[7] === 0x0a;
    if (isPng) {
      return 'image/png';
    }

    const isJpeg = bytes.length >= 3
      && bytes[0] === 0xff
      && bytes[1] === 0xd8
      && bytes[2] === 0xff;
    if (isJpeg) {
      return 'image/jpeg';
    }

    const isGif = (bytes.length >= 6
      && bytes.subarray(0, 6).toString('ascii') === 'GIF87a')
      || (bytes.length >= 6
      && bytes.subarray(0, 6).toString('ascii') === 'GIF89a');
    if (isGif) {
      return 'image/gif';
    }

    const isWebp = bytes.length >= 12
      && bytes.subarray(0, 4).toString('ascii') === 'RIFF'
      && bytes.subarray(8, 12).toString('ascii') === 'WEBP';
    if (isWebp) {
      return 'image/webp';
    }

    return null;
  } finally {
    await file.close();
  }
}

async function ensureLocalUploadEditInput(filePath) {
  await mkdir(paths.uploadDir, { recursive: true });

  const [resolvedUploadDir, resolvedInputPath] = await Promise.all([
    realpath(paths.uploadDir),
    realpath(filePath)
  ]);

  if (!isPathInside(resolvedUploadDir, resolvedInputPath)) {
    throw new Error(INVALID_EDIT_SOURCE_MESSAGE);
  }
}

async function ensureValidEditInput(request) {
  await ensureLocalUploadEditInput(request.imagePath);

  const mimeType = await detectImageMimeType(request.imagePath);
  if (!mimeType) {
    throw new Error(INVALID_EDIT_INPUT_MESSAGE);
  }

  return mimeType;
}

export async function generateImage(request) {
  const id = createId();
  const config = await configStore.readConfig();
  const params = withDefaults(config, request);

  let saved;

  try {
    ensureConfigured(config);
    const buffer = await callGenerateApi(config, params);
    saved = await saveImage(buffer, id);
  } catch (error) {
    await appendFailedHistoryOrAnnotate(error, {
      id,
      type: 'generate',
      status: 'failed',
      createdAt: new Date().toISOString(),
      prompt: params.prompt,
      params,
      error: error.message
    });
  }

  return historyStore.appendHistory({
    id,
    type: 'generate',
    status: 'success',
    createdAt: new Date().toISOString(),
    prompt: params.prompt,
    params,
    fileName: saved.fileName,
    outputPath: saved.outputPath
  });
}

export async function editImage(request) {
  const id = createId();
  const config = await configStore.readConfig();
  const params = withDefaults(config, request);

  let saved;

  try {
    ensureConfigured(config);
    const mimeType = await ensureValidEditInput(request);
    const buffer = await callEditApi(config, {
      ...params,
      imagePath: request.imagePath,
      mimeType
    });
    saved = await saveImage(buffer, id);
  } catch (error) {
    await appendFailedHistoryOrAnnotate(error, {
      id,
      type: 'edit',
      status: 'failed',
      createdAt: new Date().toISOString(),
      prompt: params.prompt,
      params,
      inputPath: request.imagePath,
      error: error.message
    });
  }

  return historyStore.appendHistory({
    id,
    type: 'edit',
    status: 'success',
    createdAt: new Date().toISOString(),
    prompt: params.prompt,
    params,
    inputPath: request.imagePath,
    fileName: saved.fileName,
    outputPath: saved.outputPath
  });
}
