import { chmod, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { paths } from './paths.js';

const defaultConfig = {
  baseUrl: '',
  apiKey: '',
  model: 'gpt-image-2',
  size: '1024x1024',
  quality: 'medium'
};

function maskKey(apiKey) {
  if (!apiKey) return '';
  if (apiKey.length <= 8) return '••••';
  return `${apiKey.slice(0, 4)}…${apiKey.slice(-4)}`;
}

async function restrictConfigPermissions(configFile) {
  const configDir = path.dirname(configFile);
  await chmod(configDir, 0o700);
  await chmod(configFile, 0o600);
}

export function createConfigStore(configFile = paths.configFile) {
  async function readConfig() {
    try {
      const raw = await readFile(configFile, 'utf8');
      await restrictConfigPermissions(configFile);
      return { ...defaultConfig, ...JSON.parse(raw) };
    } catch (error) {
      if (error.code === 'ENOENT') return { ...defaultConfig };
      throw error;
    }
  }

  async function writeConfig(config) {
    const next = { ...defaultConfig, ...config };
    await mkdir(path.dirname(configFile), { recursive: true, mode: 0o700 });
    await writeFile(configFile, `${JSON.stringify(next, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
    await restrictConfigPermissions(configFile);
    return next;
  }

  async function readSafeConfig() {
    const config = await readConfig();
    return {
      baseUrl: config.baseUrl,
      hasApiKey: Boolean(config.apiKey),
      apiKeyPreview: maskKey(config.apiKey),
      model: config.model,
      size: config.size,
      quality: config.quality
    };
  }

  return { readConfig, writeConfig, readSafeConfig };
}

export const configStore = createConfigStore();
