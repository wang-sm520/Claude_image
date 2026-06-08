import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

export const paths = {
  root,
  configDir: path.join(os.homedir(), '.local-image-console'),
  configFile: path.join(os.homedir(), '.local-image-console', 'config.json'),
  outputDir: path.join(root, 'output'),
  uploadDir: path.join(root, 'output', 'uploads'),
  imageDir: path.join(root, 'output', 'images'),
  historyFile: path.join(root, 'output', 'history.json')
};
