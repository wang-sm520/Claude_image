import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockReadConfig = vi.fn();
const mockAppendHistory = vi.fn(async (item) => item);
const mockCallGenerateApi = vi.fn();
const mockCallEditApi = vi.fn();
const mockRandomUUID = vi.fn();
let imageDir;

vi.mock('../src/lib/config.js', () => ({
  configStore: {
    readConfig: mockReadConfig
  }
}));

vi.mock('../src/lib/history.js', () => ({
  historyStore: {
    appendHistory: mockAppendHistory
  }
}));

vi.mock('../src/lib/imageApi.js', () => ({
  callGenerateApi: mockCallGenerateApi,
  callEditApi: mockCallEditApi
}));

vi.mock('node:crypto', () => ({
  randomUUID: mockRandomUUID
}));

let outputDir;

vi.mock('../src/lib/paths.js', () => ({
  paths: {
    get outputDir() {
      return outputDir;
    },
    get uploadDir() {
      return path.join(outputDir, 'uploads');
    },
    get imageDir() {
      return imageDir;
    }
  }
}));

let tempDir;
let generateImage;
let editImage;

beforeEach(async () => {
  tempDir = await mkdtemp(path.join(os.tmpdir(), 'image-service-test-'));
  outputDir = path.join(tempDir, 'output');
  imageDir = path.join(outputDir, 'images');
  vi.resetModules();
  vi.clearAllMocks();
  mockRandomUUID.mockReset();
  mockRandomUUID
    .mockReturnValueOnce('uuid-1')
    .mockReturnValueOnce('uuid-2')
    .mockReturnValue('uuid-default');
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-06-07T12:34:56.789Z'));

  ({ generateImage, editImage } = await import('../src/lib/imageService.js'));
});

afterEach(async () => {
  vi.useRealTimers();
  await rm(tempDir, { recursive: true, force: true });
});

describe('image service', () => {
  it('generates an image, saves it, and records success history', async () => {
    mockReadConfig.mockResolvedValue({
      baseUrl: 'https://example.test',
      apiKey: 'secret',
      model: 'gpt-image-2',
      size: '1024x1024',
      quality: 'medium'
    });
    mockCallGenerateApi.mockResolvedValue(Buffer.from('generated image bytes'));

    const item = await generateImage({ prompt: 'sunrise over mountains' });

    const id = '2026-06-07T12-34-56-789Z-uuid-1';
    const outputPath = path.join(imageDir, `${id}.png`);
    await expect(readFile(outputPath)).resolves.toEqual(Buffer.from('generated image bytes'));
    expect(mockCallGenerateApi).toHaveBeenCalledWith(
      expect.objectContaining({ baseUrl: 'https://example.test', apiKey: 'secret' }),
      {
        model: 'gpt-image-2',
        size: '1024x1024',
        quality: 'medium',
        prompt: 'sunrise over mountains'
      }
    );
    expect(mockAppendHistory).toHaveBeenCalledWith(
      expect.objectContaining({
        id,
        type: 'generate',
        status: 'success',
        prompt: 'sunrise over mountains',
        fileName: `${id}.png`,
        outputPath
      })
    );
    expect(item).toEqual(expect.objectContaining({ id, status: 'success', outputPath }));
  });

  it('records failed edit history and attaches it to the error', async () => {
    mockReadConfig.mockResolvedValue({
      baseUrl: 'https://example.test',
      apiKey: 'secret',
      model: 'gpt-image-2',
      size: '1024x1024',
      quality: 'medium'
    });
    mockCallEditApi.mockRejectedValue(new Error('edit failed'));

    const uploadsDir = path.join(outputDir, 'uploads');
    await mkdir(uploadsDir, { recursive: true });
    const inputPath = path.join(uploadsDir, 'upload.png');
    await writeFile(inputPath, Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
    const request = {
      prompt: 'remove background',
      imagePath: inputPath,
      mimeType: 'image/jpeg'
    };

    await expect(editImage(request)).rejects.toMatchObject({
      message: 'edit failed',
      historyItem: expect.objectContaining({
        type: 'edit',
        status: 'failed',
        inputPath,
        error: 'edit failed'
      })
    });
    expect(mockCallEditApi).toHaveBeenCalledWith(
      expect.objectContaining({ baseUrl: 'https://example.test', apiKey: 'secret' }),
      {
        model: 'gpt-image-2',
        size: '1024x1024',
        quality: 'medium',
        prompt: 'remove background',
        imagePath: inputPath,
        mimeType: 'image/png'
      }
    );
    expect(mockAppendHistory).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'edit',
        status: 'failed',
        inputPath,
        error: 'edit failed'
      })
    );
  });

  it('fails early when API configuration is missing', async () => {
    mockReadConfig.mockResolvedValue({
      baseUrl: '',
      apiKey: '',
      model: 'gpt-image-2',
      size: '1024x1024',
      quality: 'medium'
    });

    await expect(generateImage({ prompt: 'test prompt' })).rejects.toMatchObject({
      message: 'Missing API configuration. Save base URL and API key first.',
      historyItem: expect.objectContaining({
        type: 'generate',
        status: 'failed',
        error: 'Missing API configuration. Save base URL and API key first.'
      })
    });
    expect(mockCallGenerateApi).not.toHaveBeenCalled();
  });

  it('uses distinct ids and output paths for generate calls in the same millisecond', async () => {
    mockReadConfig.mockResolvedValue({
      baseUrl: 'https://example.test',
      apiKey: 'secret',
      model: 'gpt-image-2',
      size: '1024x1024',
      quality: 'medium'
    });
    mockCallGenerateApi
      .mockResolvedValueOnce(Buffer.from('first image bytes'))
      .mockResolvedValueOnce(Buffer.from('second image bytes'));

    const first = await generateImage({ prompt: 'first prompt' });
    const second = await generateImage({ prompt: 'second prompt' });

    expect(first.id).not.toBe(second.id);
    expect(first.outputPath).not.toBe(second.outputPath);
    expect(first.id).toBe('2026-06-07T12-34-56-789Z-uuid-1');
    expect(second.id).toBe('2026-06-07T12-34-56-789Z-uuid-2');
    expect(mockAppendHistory).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ id: first.id, outputPath: first.outputPath, status: 'success' })
    );
    expect(mockAppendHistory).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ id: second.id, outputPath: second.outputPath, status: 'success' })
    );
  });

  it('rejects a non-image temp file before calling the edit API', async () => {
    mockReadConfig.mockResolvedValue({
      baseUrl: 'https://example.test',
      apiKey: 'secret',
      model: 'gpt-image-2',
      size: '1024x1024',
      quality: 'medium'
    });
    const uploadsDir = path.join(outputDir, 'uploads');
    await mkdir(uploadsDir, { recursive: true });
    const inputPath = path.join(uploadsDir, 'upload.txt');
    await writeFile(inputPath, 'plain text, not an image');

    await expect(
      editImage({ prompt: 'remove background', imagePath: inputPath, mimeType: 'application/octet-stream' })
    ).rejects.toMatchObject({
      message: 'Edit input must be a PNG, JPEG, GIF, or WebP image.',
      historyItem: expect.objectContaining({
        type: 'edit',
        status: 'failed',
        inputPath,
        error: 'Edit input must be a PNG, JPEG, GIF, or WebP image.'
      })
    });
    expect(mockCallEditApi).not.toHaveBeenCalled();
    expect(mockAppendHistory).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'edit',
        status: 'failed',
        inputPath,
        error: 'Edit input must be a PNG, JPEG, GIF, or WebP image.'
      })
    );
  });

  it('rejects a valid image file outside the upload directory with failed history', async () => {
    mockReadConfig.mockResolvedValue({
      baseUrl: 'https://example.test',
      apiKey: 'secret',
      model: 'gpt-image-2',
      size: '1024x1024',
      quality: 'medium'
    });
    const inputPath = path.join(tempDir, 'outside.png');
    await writeFile(inputPath, Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));

    await expect(
      editImage({ prompt: 'remove background', imagePath: inputPath, mimeType: 'image/png' })
    ).rejects.toMatchObject({
      message: 'Edit input must come from the local upload directory.',
      historyItem: expect.objectContaining({
        type: 'edit',
        status: 'failed',
        inputPath,
        error: 'Edit input must come from the local upload directory.'
      })
    });
    expect(mockCallEditApi).not.toHaveBeenCalled();
    expect(mockAppendHistory).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'edit',
        status: 'failed',
        inputPath,
        error: 'Edit input must come from the local upload directory.'
      })
    );
  });

  it('rejects a symlink inside uploads that resolves outside the upload directory with failed history', async () => {
    mockReadConfig.mockResolvedValue({
      baseUrl: 'https://example.test',
      apiKey: 'secret',
      model: 'gpt-image-2',
      size: '1024x1024',
      quality: 'medium'
    });
    const uploadsDir = path.join(outputDir, 'uploads');
    await mkdir(uploadsDir, { recursive: true });
    const outsidePath = path.join(tempDir, 'outside.png');
    const symlinkPath = path.join(uploadsDir, 'linked.png');
    await writeFile(outsidePath, Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
    await symlink(outsidePath, symlinkPath);

    await expect(
      editImage({ prompt: 'remove background', imagePath: symlinkPath, mimeType: 'image/png' })
    ).rejects.toMatchObject({
      message: 'Edit input must come from the local upload directory.',
      historyItem: expect.objectContaining({
        type: 'edit',
        status: 'failed',
        inputPath: symlinkPath,
        error: 'Edit input must come from the local upload directory.'
      })
    });
    expect(mockCallEditApi).not.toHaveBeenCalled();
    expect(mockAppendHistory).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'edit',
        status: 'failed',
        inputPath: symlinkPath,
        error: 'Edit input must come from the local upload directory.'
      })
    );
  });

  it('preserves the original generate error when failed-history append also fails', async () => {
    mockReadConfig.mockResolvedValue({
      baseUrl: '',
      apiKey: '',
      model: 'gpt-image-2',
      size: '1024x1024',
      quality: 'medium'
    });
    const historyError = new Error('history write failed');
    mockAppendHistory.mockRejectedValueOnce(historyError);

    await expect(generateImage({ prompt: 'test prompt' })).rejects.toMatchObject({
      message: 'Missing API configuration. Save base URL and API key first.',
      historyError
    });
    expect(mockCallGenerateApi).not.toHaveBeenCalled();
    expect(mockAppendHistory).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'generate',
        status: 'failed',
        error: 'Missing API configuration. Save base URL and API key first.'
      })
    );
  });

  it('preserves the original edit error when failed-history append also fails', async () => {
    mockReadConfig.mockResolvedValue({
      baseUrl: '',
      apiKey: '',
      model: 'gpt-image-2',
      size: '1024x1024',
      quality: 'medium'
    });
    const historyError = new Error('history write failed');
    mockAppendHistory.mockRejectedValueOnce(historyError);
    const uploadsDir = path.join(outputDir, 'uploads');
    await mkdir(uploadsDir, { recursive: true });
    const inputPath = path.join(uploadsDir, 'upload.png');
    await writeFile(inputPath, Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));

    await expect(editImage({ prompt: 'remove background', imagePath: inputPath, mimeType: 'image/png' })).rejects.toMatchObject({
      message: 'Missing API configuration. Save base URL and API key first.',
      historyError
    });
    expect(mockCallEditApi).not.toHaveBeenCalled();
    expect(mockAppendHistory).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'edit',
        status: 'failed',
        inputPath,
        error: 'Missing API configuration. Save base URL and API key first.'
      })
    );
  });

  it.each([
    ['image/jpeg', 'upload.jpg', Buffer.from([0xff, 0xd8, 0xff, 0xdb])],
    ['image/gif', 'upload.gif', Buffer.from('GIF89a', 'ascii')],
    ['image/webp', 'upload.webp', Buffer.from('RIFF1234WEBP', 'ascii')]
  ])('passes detected %s to the edit API instead of caller mime type', async (detectedMimeType, fileName, bytes) => {
    mockReadConfig.mockResolvedValue({
      baseUrl: 'https://example.test',
      apiKey: 'secret',
      model: 'gpt-image-2',
      size: '1024x1024',
      quality: 'medium'
    });
    mockCallEditApi.mockResolvedValue(Buffer.from('edited image bytes'));

    const uploadsDir = path.join(outputDir, 'uploads');
    await mkdir(uploadsDir, { recursive: true });
    const inputPath = path.join(uploadsDir, fileName);
    await writeFile(inputPath, bytes);

    await editImage({ prompt: 'remove background', imagePath: inputPath, mimeType: 'image/png' });

    expect(mockCallEditApi).toHaveBeenCalledWith(
      expect.objectContaining({ baseUrl: 'https://example.test', apiKey: 'secret' }),
      expect.objectContaining({
        imagePath: inputPath,
        mimeType: detectedMimeType
      })
    );
  });

  it('does not append failed history when success history append fails after save', async () => {
    mockReadConfig.mockResolvedValue({
      baseUrl: 'https://example.test',
      apiKey: 'secret',
      model: 'gpt-image-2',
      size: '1024x1024',
      quality: 'medium'
    });
    mockCallGenerateApi.mockResolvedValue(Buffer.from('generated image bytes'));
    mockAppendHistory.mockRejectedValueOnce(new Error('history write failed'));

    const expectedId = '2026-06-07T12-34-56-789Z-uuid-1';
    const expectedOutputPath = path.join(imageDir, `${expectedId}.png`);

    await expect(generateImage({ prompt: 'sunrise over mountains' })).rejects.toThrow('history write failed');
    await expect(readFile(expectedOutputPath)).resolves.toEqual(Buffer.from('generated image bytes'));
    expect(mockAppendHistory).toHaveBeenCalledTimes(1);
    expect(mockAppendHistory).toHaveBeenCalledWith(
      expect.objectContaining({
        id: expectedId,
        type: 'generate',
        status: 'success',
        outputPath: expectedOutputPath
      })
    );
  });
});
