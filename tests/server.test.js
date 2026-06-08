import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockReadSafeConfig = vi.fn();
const mockReadConfig = vi.fn();
const mockWriteConfig = vi.fn();
const mockReadHistory = vi.fn();
const mockGenerateImage = vi.fn();
const mockEditImage = vi.fn();
let imageDir;
let uploadDir;

vi.mock('../src/lib/config.js', () => ({
  configStore: {
    readConfig: mockReadConfig,
    readSafeConfig: mockReadSafeConfig,
    writeConfig: mockWriteConfig
  }
}));

vi.mock('../src/lib/history.js', () => ({
  historyStore: {
    readHistory: mockReadHistory
  }
}));

vi.mock('../src/lib/imageService.js', () => ({
  generateImage: mockGenerateImage,
  editImage: mockEditImage
}));

vi.mock('../src/lib/paths.js', () => ({
  paths: {
    get imageDir() {
      return imageDir;
    },
    get uploadDir() {
      return uploadDir;
    }
  }
}));

let tempDir;
let baseUrl;
let createApp;

async function requestJson(url, options = {}) {
  const response = await fetch(url, options);
  return {
    response,
    json: await response.json()
  };
}

async function withServer(app, callback) {
  const server = app.listen(0, '127.0.0.1');

  try {
    await new Promise((resolve, reject) => {
      server.once('listening', resolve);
      server.once('error', reject);
    });

    const { port } = server.address();
    await callback(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
}

beforeEach(async () => {
  tempDir = await mkdtemp(path.join(tmpdir(), 'image-console-server-'));
  imageDir = path.join(tempDir, 'images');
  uploadDir = path.join(tempDir, 'uploads');
  vi.resetModules();
  vi.clearAllMocks();

  ({ createApp } = await import('../src/server/index.js'));
});

afterEach(async () => {
  await rm(tempDir, { recursive: true, force: true });
});

describe('createApp', () => {
  it('returns safe config from GET /api/config', async () => {
    mockReadSafeConfig.mockResolvedValue({
      baseUrl: 'https://example.test',
      hasApiKey: true,
      apiKeyPreview: 'test…-key',
      model: 'gpt-image-2',
      size: '1024x1024',
      quality: 'medium'
    });

    await withServer(createApp(), async (url) => {
      const { response, json } = await requestJson(`${url}/api/config`);

      expect(response.status).toBe(200);
      expect(json).toEqual({
        baseUrl: 'https://example.test',
        hasApiKey: true,
        apiKeyPreview: 'test…-key',
        model: 'gpt-image-2',
        size: '1024x1024',
        quality: 'medium'
      });
    });

    expect(mockReadSafeConfig).toHaveBeenCalledTimes(1);
  });

  it('writes config and returns safe config from POST /api/config', async () => {
    mockWriteConfig.mockResolvedValue();
    mockReadSafeConfig.mockResolvedValue({
      baseUrl: 'https://example.test',
      hasApiKey: true,
      apiKeyPreview: 'test…-key',
      model: 'gpt-image-2',
      size: '1536x1024',
      quality: 'high'
    });

    await withServer(createApp(), async (url) => {
      const payload = {
        baseUrl: 'https://example.test',
        apiKey: 'test-api-key',
        model: 'gpt-image-2',
        size: '1536x1024',
        quality: 'high'
      };
      const { response, json } = await requestJson(`${url}/api/config`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      expect(response.status).toBe(200);
      expect(json).toEqual({
        baseUrl: 'https://example.test',
        hasApiKey: true,
        apiKeyPreview: 'test…-key',
        model: 'gpt-image-2',
        size: '1536x1024',
        quality: 'high'
      });
      expect(mockWriteConfig).toHaveBeenCalledWith(payload);
    });
  });

  it('preserves existing apiKey when POST /api/config omits apiKey', async () => {
    mockReadConfig.mockResolvedValue({
      baseUrl: 'https://old.example.test',
      apiKey: 'existing-api-key',
      model: 'gpt-image-2',
      size: '1024x1024',
      quality: 'medium'
    });
    mockWriteConfig.mockResolvedValue();
    mockReadSafeConfig.mockResolvedValue({
      baseUrl: 'https://new.example.test',
      hasApiKey: true,
      apiKeyPreview: 'exis…-key',
      model: 'gpt-image-2',
      size: '1536x1024',
      quality: 'high'
    });

    await withServer(createApp(), async (url) => {
      const payload = {
        baseUrl: 'https://new.example.test',
        model: 'gpt-image-2',
        size: '1536x1024',
        quality: 'high'
      };
      const { response, json } = await requestJson(`${url}/api/config`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      expect(response.status).toBe(200);
      expect(json).toEqual({
        baseUrl: 'https://new.example.test',
        hasApiKey: true,
        apiKeyPreview: 'exis…-key',
        model: 'gpt-image-2',
        size: '1536x1024',
        quality: 'high'
      });
      expect(json).not.toHaveProperty('apiKey');
      expect(mockWriteConfig).toHaveBeenCalledWith({
        ...payload,
        apiKey: 'existing-api-key'
      });
    });
  });

  it('preserves existing apiKey when POST /api/config sends blank apiKey', async () => {
    mockReadConfig.mockResolvedValue({
      baseUrl: 'https://old.example.test',
      apiKey: 'existing-api-key',
      model: 'gpt-image-2',
      size: '1024x1024',
      quality: 'medium'
    });
    mockWriteConfig.mockResolvedValue();
    mockReadSafeConfig.mockResolvedValue({
      baseUrl: 'https://new.example.test',
      hasApiKey: true,
      apiKeyPreview: 'exis…-key',
      model: 'gpt-image-2',
      size: '1536x1024',
      quality: 'high'
    });

    await withServer(createApp(), async (url) => {
      const payload = {
        baseUrl: 'https://new.example.test',
        apiKey: '   \t  ',
        model: 'gpt-image-2',
        size: '1536x1024',
        quality: 'high'
      };
      const { response, json } = await requestJson(`${url}/api/config`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      expect(response.status).toBe(200);
      expect(json).toEqual({
        baseUrl: 'https://new.example.test',
        hasApiKey: true,
        apiKeyPreview: 'exis…-key',
        model: 'gpt-image-2',
        size: '1536x1024',
        quality: 'high'
      });
      expect(json).not.toHaveProperty('apiKey');
      expect(mockWriteConfig).toHaveBeenCalledWith({
        baseUrl: 'https://new.example.test',
        apiKey: 'existing-api-key',
        model: 'gpt-image-2',
        size: '1536x1024',
        quality: 'high'
      });
    });
  });

  it('updates apiKey when POST /api/config sends non-empty apiKey', async () => {
    mockWriteConfig.mockResolvedValue();
    mockReadSafeConfig.mockResolvedValue({
      baseUrl: 'https://example.test',
      hasApiKey: true,
      apiKeyPreview: 'new-…-key',
      model: 'gpt-image-2',
      size: '1536x1024',
      quality: 'high'
    });

    await withServer(createApp(), async (url) => {
      const payload = {
        baseUrl: 'https://example.test',
        apiKey: '  new-api-key  ',
        model: 'gpt-image-2',
        size: '1536x1024',
        quality: 'high'
      };
      const { response, json } = await requestJson(`${url}/api/config`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      expect(response.status).toBe(200);
      expect(json).toEqual({
        baseUrl: 'https://example.test',
        hasApiKey: true,
        apiKeyPreview: 'new-…-key',
        model: 'gpt-image-2',
        size: '1536x1024',
        quality: 'high'
      });
      expect(json).not.toHaveProperty('apiKey');
      expect(mockWriteConfig).toHaveBeenCalledWith({
        baseUrl: 'https://example.test',
        apiKey: 'new-api-key',
        model: 'gpt-image-2',
        size: '1536x1024',
        quality: 'high'
      });
    });
  });

  it('returns generated image history item from POST /api/generate', async () => {
    mockGenerateImage.mockResolvedValue({ id: 'gen-1', status: 'success' });

    await withServer(createApp(), async (url) => {
      const payload = { prompt: 'sunrise', model: 'gpt-image-2' };
      const { response, json } = await requestJson(`${url}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      expect(response.status).toBe(200);
      expect(json).toEqual({ id: 'gen-1', status: 'success' });
      expect(mockGenerateImage).toHaveBeenCalledWith(payload);
    });
  });

  it('returns 400 with error and historyItem when POST /api/generate fails', async () => {
    const error = new Error('generation failed');
    error.historyItem = { id: 'gen-fail', status: 'failed' };
    mockGenerateImage.mockRejectedValue(error);

    await withServer(createApp(), async (url) => {
      const { response, json } = await requestJson(`${url}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: 'sunrise' })
      });

      expect(response.status).toBe(400);
      expect(json).toEqual({
        error: 'generation failed',
        historyItem: { id: 'gen-fail', status: 'failed' }
      });
    });
  });

  it('returns 400 when POST /api/edit is missing an upload', async () => {
    await withServer(createApp(), async (url) => {
      const form = new FormData();
      form.set('prompt', 'remove background');

      const { response, json } = await requestJson(`${url}/api/edit`, {
        method: 'POST',
        body: form
      });

      expect(response.status).toBe(400);
      expect(json).toEqual({ error: 'Upload an image before editing.' });
    });

    expect(mockEditImage).not.toHaveBeenCalled();
  });

  it('stores upload in paths.uploadDir and forwards edit request fields', async () => {
    mockEditImage.mockResolvedValue({ id: 'edit-1', status: 'success' });

    await withServer(createApp(), async (url) => {
      const form = new FormData();
      form.set('prompt', 'remove background');
      form.set('model', 'gpt-image-2');
      form.set('size', '1024x1536');
      form.set('quality', 'high');
      form.set('image', new Blob([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])], { type: 'image/png' }), 'upload.png');

      const { response, json } = await requestJson(`${url}/api/edit`, {
        method: 'POST',
        body: form
      });

      expect(response.status).toBe(200);
      expect(json).toEqual({ id: 'edit-1', status: 'success' });
      expect(mockEditImage).toHaveBeenCalledTimes(1);
      expect(mockEditImage).toHaveBeenCalledWith({
        prompt: 'remove background',
        model: 'gpt-image-2',
        size: '1024x1536',
        quality: 'high',
        imagePath: expect.stringContaining(uploadDir),
        mimeType: 'image/png'
      });

      const [{ imagePath }] = mockEditImage.mock.calls[0];
      await expect(readFile(imagePath)).resolves.toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
    });
  });

  it('returns 400 with error and historyItem when POST /api/edit fails', async () => {
    const error = new Error('edit failed');
    error.historyItem = { id: 'edit-fail', status: 'failed' };
    mockEditImage.mockRejectedValue(error);

    await withServer(createApp(), async (url) => {
      const form = new FormData();
      form.set('prompt', 'remove background');
      form.set('image', new Blob([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])], { type: 'image/png' }), 'upload.png');

      const { response, json } = await requestJson(`${url}/api/edit`, {
        method: 'POST',
        body: form
      });

      expect(response.status).toBe(400);
      expect(json).toEqual({
        error: 'edit failed',
        historyItem: { id: 'edit-fail', status: 'failed' }
      });
    });
  });

  it('returns history from GET /api/history', async () => {
    mockReadHistory.mockResolvedValue([{ id: 'one' }, { id: 'two' }]);

    await withServer(createApp(), async (url) => {
      const { response, json } = await requestJson(`${url}/api/history`);

      expect(response.status).toBe(200);
      expect(json).toEqual([{ id: 'one' }, { id: 'two' }]);
    });
  });

  it('serves generated images from /api/images', async () => {
    await mkdir(imageDir, { recursive: true });
    await writeFile(path.join(imageDir, 'sample.png'), 'image-bytes', 'utf8');

    await withServer(createApp(), async (url) => {
      const response = await fetch(`${url}/api/images/sample.png`);

      expect(response.status).toBe(200);
      await expect(response.text()).resolves.toBe('image-bytes');
    });
  });

  it('returns 500 from the final error handler', async () => {
    mockReadSafeConfig.mockRejectedValue(new Error('unexpected failure'));

    await withServer(createApp(), async (url) => {
      const { response, json } = await requestJson(`${url}/api/config`);

      expect(response.status).toBe(500);
      expect(json).toEqual({ error: 'unexpected failure' });
    });
  });
});
