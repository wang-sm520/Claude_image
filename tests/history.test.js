import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createHistoryStore } from '../src/lib/history.js';

let tempDir;

beforeEach(async () => {
  tempDir = await mkdtemp(path.join(tmpdir(), 'image-console-history-'));
});

afterEach(async () => {
  await rm(tempDir, { recursive: true, force: true });
});

describe('history store', () => {
  it('appends newest items first', async () => {
    const store = createHistoryStore(path.join(tempDir, 'history.json'));

    await store.appendHistory({ id: 'one', status: 'success' });
    await store.appendHistory({ id: 'two', status: 'failed' });

    await expect(store.readHistory()).resolves.toEqual([
      { id: 'two', status: 'failed' },
      { id: 'one', status: 'success' }
    ]);
  });

  it('preserves all items when appendHistory runs concurrently on the same store', async () => {
    const store = createHistoryStore(path.join(tempDir, 'history.json'));
    const items = Array.from({ length: 25 }, (_, index) => ({
      id: `item-${index}`,
      status: index % 2 === 0 ? 'success' : 'failed'
    }));

    await Promise.all(items.map((item) => store.appendHistory(item)));

    const history = await store.readHistory();
    expect(history).toHaveLength(items.length);
    expect(new Set(history.map((item) => item.id))).toEqual(new Set(items.map((item) => item.id)));
    expect(history.map((item) => item.id)).toEqual(items.map((item) => item.id).reverse());
  });

  it('backs up corrupted history and starts fresh', async () => {
    const historyFile = path.join(tempDir, 'history.json');
    const store = createHistoryStore(historyFile);
    await writeFile(historyFile, '{bad json', 'utf8');

    await expect(store.readHistory()).resolves.toEqual([]);
    await expect(readFile(`${historyFile}.corrupt`, 'utf8')).resolves.toBe('{bad json');
  });

  it('returns an empty array for non-array JSON history', async () => {
    const historyFile = path.join(tempDir, 'history.json');
    const store = createHistoryStore(historyFile);
    await writeFile(historyFile, JSON.stringify({ id: 'not-an-array' }), 'utf8');

    await expect(store.readHistory()).resolves.toEqual([]);
  });
});
