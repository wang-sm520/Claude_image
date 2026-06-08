import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { paths } from './paths.js';

export function createHistoryStore(historyFile = paths.historyFile) {
  let writeQueue = Promise.resolve();

  async function readHistory() {
    let raw;

    try {
      raw = await readFile(historyFile, 'utf8');
    } catch (error) {
      if (error.code === 'ENOENT') return [];
      throw error;
    }

    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
      if (error instanceof SyntaxError) {
        await rename(historyFile, `${historyFile}.corrupt`).catch(() => {});
        return [];
      }

      throw error;
    }
  }

  function appendHistory(item) {
    const nextWrite = writeQueue.then(async () => {
      const current = await readHistory();
      const next = [item, ...current].slice(0, 200);
      await mkdir(path.dirname(historyFile), { recursive: true });
      await writeFile(historyFile, `${JSON.stringify(next, null, 2)}\n`, 'utf8');
      return item;
    });

    writeQueue = nextWrite.catch(() => {});
    return nextWrite;
  }

  return { readHistory, appendHistory };
}

export const historyStore = createHistoryStore();
