import { mkdtemp, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createConfigStore } from '../src/lib/config.js';

let tempDir;

beforeEach(async () => {
  tempDir = await mkdtemp(path.join(tmpdir(), 'image-console-config-'));
});

afterEach(async () => {
  await rm(tempDir, { recursive: true, force: true });
});

describe('config store', () => {
  it('writes and reads config', async () => {
    const store = createConfigStore(path.join(tempDir, 'config.json'));

    await store.writeConfig({
      baseUrl: 'https://example.test',
      apiKey: 'test-api-key',
      model: 'gpt-image-2',
      size: '1024x1024',
      quality: 'medium'
    });

    await expect(store.readConfig()).resolves.toEqual({
      baseUrl: 'https://example.test',
      apiKey: 'test-api-key',
      model: 'gpt-image-2',
      size: '1024x1024',
      quality: 'medium'
    });
  });

  it('returns safe config without exposing full key', async () => {
    const store = createConfigStore(path.join(tempDir, 'config.json'));

    await store.writeConfig({
      baseUrl: 'https://example.test',
      apiKey: 'test-api-key',
      model: 'gpt-image-2',
      size: '1024x1024',
      quality: 'medium'
    });

    await expect(store.readSafeConfig()).resolves.toEqual({
      baseUrl: 'https://example.test',
      hasApiKey: true,
      apiKeyPreview: 'test…-key',
      model: 'gpt-image-2',
      size: '1024x1024',
      quality: 'medium'
    });
  });

  it('returns defaults when config does not exist', async () => {
    const store = createConfigStore(path.join(tempDir, 'missing.json'));

    await expect(store.readSafeConfig()).resolves.toEqual({
      baseUrl: '',
      hasApiKey: false,
      apiKeyPreview: '',
      model: 'gpt-image-2',
      size: '1024x1024',
      quality: 'medium'
    });
  });

  it.runIf(process.platform !== 'win32')('writes config with restricted directory and file permissions', async () => {
    const configFile = path.join(tempDir, 'secure-config', 'config.json');
    const store = createConfigStore(configFile);

    await store.writeConfig({
      baseUrl: 'https://example.test',
      apiKey: 'test-api-key',
      model: 'gpt-image-2',
      size: '1024x1024',
      quality: 'medium'
    });

    const configDirMode = (await stat(path.dirname(configFile))).mode & 0o777;
    const configFileMode = (await stat(configFile)).mode & 0o777;

    expect(configDirMode).toBe(0o700);
    expect(configFileMode).toBe(0o600);
  });
});
