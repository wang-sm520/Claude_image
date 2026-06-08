import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';

const mockReadSafeConfig = vi.fn();
const mockReadConfig = vi.fn();
const mockWriteConfig = vi.fn();
const mockGenerateImage = vi.fn();
const mockEditImage = vi.fn();
const mockRandomUUID = vi.fn();
let uploadDir;

vi.mock('../src/lib/config.js', () => ({
  configStore: {
    readSafeConfig: mockReadSafeConfig,
    readConfig: mockReadConfig,
    writeConfig: mockWriteConfig
  }
}));

vi.mock('../src/lib/imageService.js', () => ({
  generateImage: mockGenerateImage,
  editImage: mockEditImage
}));

vi.mock('../src/lib/paths.js', () => ({
  paths: {
    get uploadDir() {
      return uploadDir;
    }
  }
}));

vi.mock('node:crypto', () => ({
  randomUUID: mockRandomUUID
}));

let tempDir;
let createProgram;

const execFileAsync = promisify(execFile);
const cliPath = fileURLToPath(new URL('../src/cli/index.js', import.meta.url));

async function parseCli(args) {
  const program = createProgram();
  program.exitOverride();
  program.configureOutput({
    writeOut: () => {},
    writeErr: () => {}
  });
  await program.parseAsync(['node', 'image-console', ...args]);
}

beforeEach(async () => {
  tempDir = await mkdtemp(path.join(os.tmpdir(), 'image-console-cli-'));
  uploadDir = path.join(tempDir, 'uploads');
  vi.resetModules();
  vi.clearAllMocks();
  mockRandomUUID.mockReturnValue('uuid-1');
  ({ createProgram } = await import('../src/cli/index.js'));
});

afterEach(async () => {
  await rm(tempDir, { recursive: true, force: true });
});

describe('CLI', () => {
  it('prints safe config for config command', async () => {
    mockReadSafeConfig.mockResolvedValue({
      baseUrl: 'https://example.test',
      hasApiKey: true,
      apiKeyPreview: 'test…-key',
      model: 'gpt-image-2',
      size: '1024x1024',
      quality: 'medium'
    });
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});

    await parseCli(['config']);

    expect(mockReadSafeConfig).toHaveBeenCalledOnce();
    expect(log).toHaveBeenCalledWith(JSON.stringify({
      baseUrl: 'https://example.test',
      hasApiKey: true,
      apiKeyPreview: 'test…-key',
      model: 'gpt-image-2',
      size: '1024x1024',
      quality: 'medium'
    }, null, 2));
    log.mockRestore();
  });

  it('writes config with defaults and prints safe config', async () => {
    mockReadSafeConfig.mockResolvedValue({
      baseUrl: 'https://example.test',
      hasApiKey: true,
      apiKeyPreview: 'test…-key',
      model: 'gpt-image-2',
      size: '1024x1024',
      quality: 'medium'
    });
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});

    await parseCli(['set-config', '--base-url', 'https://example.test', '--api-key', 'test-api-key']);

    expect(mockWriteConfig).toHaveBeenCalledWith({
      baseUrl: 'https://example.test',
      apiKey: 'test-api-key',
      model: 'gpt-image-2',
      size: '1024x1024',
      quality: 'medium'
    });
    expect(mockReadConfig).not.toHaveBeenCalled();
    expect(mockReadSafeConfig).toHaveBeenCalledOnce();
    expect(log).toHaveBeenCalledWith(JSON.stringify({
      baseUrl: 'https://example.test',
      hasApiKey: true,
      apiKeyPreview: 'test…-key',
      model: 'gpt-image-2',
      size: '1024x1024',
      quality: 'medium'
    }, null, 2));
    log.mockRestore();
  });

  it('preserves existing apiKey when set-config receives a blank API key', async () => {
    mockReadConfig.mockResolvedValue({ apiKey: 'existing-api-key' });
    mockReadSafeConfig.mockResolvedValue({
      baseUrl: 'https://example.test',
      hasApiKey: true,
      apiKeyPreview: 'exis…-key',
      model: 'gpt-image-2',
      size: '1024x1024',
      quality: 'medium'
    });
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});

    await parseCli(['set-config', '--base-url', 'https://example.test', '--api-key', '   \t  ']);

    expect(mockReadConfig).toHaveBeenCalledOnce();
    expect(mockWriteConfig).toHaveBeenCalledWith({
      baseUrl: 'https://example.test',
      apiKey: 'existing-api-key',
      model: 'gpt-image-2',
      size: '1024x1024',
      quality: 'medium'
    });
    expect(log).toHaveBeenCalledWith(JSON.stringify({
      baseUrl: 'https://example.test',
      hasApiKey: true,
      apiKeyPreview: 'exis…-key',
      model: 'gpt-image-2',
      size: '1024x1024',
      quality: 'medium'
    }, null, 2));
    log.mockRestore();
  });

  it('preserves existing apiKey when set-config omits API key', async () => {
    mockReadConfig.mockResolvedValue({ apiKey: 'existing-api-key' });
    mockReadSafeConfig.mockResolvedValue({
      baseUrl: 'https://example.test',
      hasApiKey: true,
      apiKeyPreview: 'exis…-key',
      model: 'gpt-image-2',
      size: '512x512',
      quality: 'high'
    });
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});

    await parseCli([
      'set-config',
      '--base-url', 'https://example.test',
      '--model', 'gpt-image-2',
      '--size', '512x512',
      '--quality', 'high'
    ]);

    expect(mockReadConfig).toHaveBeenCalledOnce();
    expect(mockWriteConfig).toHaveBeenCalledWith({
      baseUrl: 'https://example.test',
      apiKey: 'existing-api-key',
      model: 'gpt-image-2',
      size: '512x512',
      quality: 'high'
    });
    expect(log).toHaveBeenCalledWith(JSON.stringify({
      baseUrl: 'https://example.test',
      hasApiKey: true,
      apiKeyPreview: 'exis…-key',
      model: 'gpt-image-2',
      size: '512x512',
      quality: 'high'
    }, null, 2));
    log.mockRestore();
  });

  it('generates an image and prints the output path', async () => {
    mockGenerateImage.mockResolvedValue({ outputPath: '/tmp/generated.png' });
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});

    await parseCli(['generate', 'a mountain sunrise', '--size', '512x512']);

    expect(mockGenerateImage).toHaveBeenCalledWith({
      prompt: 'a mountain sunrise',
      model: undefined,
      size: '512x512',
      quality: undefined
    });
    expect(log).toHaveBeenCalledWith('/tmp/generated.png');
    log.mockRestore();
  });

  it('copies a local edit image into uploadDir before calling editImage', async () => {
    const sourcePath = path.join(tempDir, 'source file.png');
    await writeFile(sourcePath, Buffer.from([0x89, 0x50, 0x4e, 0x47]));
    mockEditImage.mockResolvedValue({ outputPath: '/tmp/edited.png' });
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});

    await parseCli(['edit', '--image', sourcePath, '--prompt', 'remove background', '--quality', 'high']);

    const copiedPath = path.join(uploadDir, 'uuid-1.png');
    await expect(readFile(copiedPath)).resolves.toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47]));
    expect(mockEditImage).toHaveBeenCalledWith({
      imagePath: copiedPath,
      prompt: 'remove background',
      model: undefined,
      size: undefined,
      quality: 'high'
    });
    expect(log).toHaveBeenCalledWith('/tmp/edited.png');
    log.mockRestore();
  });

  it('runs when invoked through a package-bin style symlink', async () => {
    const binPath = path.join(tempDir, 'image-console');
    await symlink(cliPath, binPath);

    const { stdout } = await execFileAsync(binPath, ['--version']);

    expect(stdout.trim()).toBe('0.1.0');
  });
});
