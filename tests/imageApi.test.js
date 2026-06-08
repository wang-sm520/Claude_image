import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { callEditApi, extractImageBuffer, normalizeBaseUrl } from '../src/lib/imageApi.js';

const tinyPng = Buffer.from('hello image').toString('base64');
const originalFetch = global.fetch;
const tempDirs = [];

afterEach(async () => {
  global.fetch = originalFetch;
  vi.restoreAllMocks();

  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe('image API helpers', () => {
  it('normalizes base URLs', () => {
    expect(normalizeBaseUrl('https://example.test/')).toBe('https://example.test');
  });

  it('rejects empty base URLs', () => {
    expect(() => normalizeBaseUrl('')).toThrow('Missing API base URL.');
  });

  it('rejects whitespace base URLs', () => {
    expect(() => normalizeBaseUrl('   ')).toThrow('Missing API base URL.');
  });

  it('extracts b64_json image responses', () => {
    const buffer = extractImageBuffer({ data: [{ b64_json: tinyPng }] });
    expect(buffer.toString('utf8')).toBe('hello image');
  });

  it('rejects unsupported image responses', () => {
    expect(() => extractImageBuffer({ data: [{}] })).toThrow('Image API response did not contain b64_json image data.');
  });

  it('omits undefined optional edit fields from FormData', async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), 'image-api-test-'));
    tempDirs.push(tempDir);
    const imagePath = path.join(tempDir, 'input.png');
    await writeFile(imagePath, Buffer.from('fake image bytes'));

    let capturedForm;
    global.fetch = vi.fn(async (_url, options) => {
      capturedForm = options.body;
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ data: [{ b64_json: tinyPng }] })
      };
    });

    await callEditApi(
      { baseUrl: 'https://example.test/', apiKey: 'secret' },
      { prompt: 'make it brighter', imagePath }
    );

    const entries = Array.from(capturedForm.entries());
    expect(entries).toContainEqual(['n', '1']);
    expect(entries.some(([key]) => key === 'model')).toBe(false);
    expect(entries.some(([key]) => key === 'size')).toBe(false);
    expect(entries.some(([key]) => key === 'quality')).toBe(false);
  });
});
