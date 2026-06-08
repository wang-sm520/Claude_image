import React from 'react';
import { renderToString } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

const modulePath = '../src/web/App.jsx';

function jsonResponse(body, init = {}) {
  return {
    ok: init.ok ?? true,
    status: init.status ?? 200,
    json: vi.fn().mockResolvedValue(body)
  };
}

function requiredFunction(module, name) {
  expect(module[name], `${name} export`).toBeTypeOf('function');
  return module[name];
}

describe('React web console', () => {
  it('renders config, generate/edit, and history panels', async () => {
    const { App } = await import(modulePath);

    const html = renderToString(<App />);

    expect(html).toContain('Config');
    expect(html).toContain('Base URL');
    expect(html).toContain('type="password"');
    expect(html).toContain('Generate');
    expect(html).toContain('Edit');
    expect(html).toContain('History');
  });

  it('loads safe config and history from the server', async () => {
    const appModule = await import(modulePath);
    const loadInitialData = requiredFunction(appModule, 'loadInitialData');
    const safeConfig = {
      baseUrl: 'https://example.test',
      hasApiKey: true,
      apiKeyPreview: 'test…-key',
      model: 'gpt-image-2',
      size: '1024x1024',
      quality: 'medium'
    };
    const history = [{ id: 'one', fileName: 'one.png' }];
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse(safeConfig))
      .mockResolvedValueOnce(jsonResponse(history));

    await expect(loadInitialData(fetchMock)).resolves.toEqual({ config: safeConfig, history });
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual(['/api/config', '/api/history']);
  });

  it('omits a blank API key when saving config', async () => {
    const appModule = await import(modulePath);
    const postConfig = requiredFunction(appModule, 'postConfig');
    const config = {
      baseUrl: 'https://example.test',
      model: 'gpt-image-2',
      size: '1536x1024',
      quality: 'high'
    };
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ ...config, hasApiKey: true, apiKeyPreview: 'test…-key' }));

    await postConfig(fetchMock, config, '   ');

    const [, options] = fetchMock.mock.calls[0];
    expect(fetchMock.mock.calls[0][0]).toBe('/api/config');
    expect(options.method).toBe('POST');
    expect(options.headers).toEqual({ 'Content-Type': 'application/json' });
    expect(JSON.parse(options.body)).toEqual(config);
  });

  it('includes a typed API key when saving config', async () => {
    const appModule = await import(modulePath);
    const buildConfigPayload = requiredFunction(appModule, 'buildConfigPayload');

    expect(buildConfigPayload({ baseUrl: 'https://example.test', model: 'gpt-image-2', size: '1024x1024', quality: 'medium' }, ' new-api-key ')).toEqual({
      baseUrl: 'https://example.test',
      apiKey: 'new-api-key',
      model: 'gpt-image-2',
      size: '1024x1024',
      quality: 'medium'
    });
  });

  it('posts generate requests as JSON with prompt and selected config values', async () => {
    const appModule = await import(modulePath);
    const postGenerate = requiredFunction(appModule, 'postGenerate');
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ id: 'gen-1', status: 'success' }));

    await postGenerate(fetchMock, {
      prompt: '  a small cat  ',
      model: 'gpt-image-2',
      size: '1024x1536',
      quality: 'medium'
    });

    const [, options] = fetchMock.mock.calls[0];
    expect(fetchMock.mock.calls[0][0]).toBe('/api/generate');
    expect(options.method).toBe('POST');
    expect(options.headers).toEqual({ 'Content-Type': 'application/json' });
    expect(JSON.parse(options.body)).toEqual({
      prompt: 'a small cat',
      model: 'gpt-image-2',
      size: '1024x1536',
      quality: 'medium'
    });
  });

  it('builds edit multipart requests and rejects missing images', async () => {
    const appModule = await import(modulePath);
    const buildEditFormData = requiredFunction(appModule, 'buildEditFormData');
    const image = new Blob(['image-bytes'], { type: 'image/png' });

    const formData = buildEditFormData({
      prompt: ' remove the background ',
      model: 'gpt-image-2',
      size: '1024x1024',
      quality: 'high'
    }, image);

    expect(formData.get('prompt')).toBe('remove the background');
    expect(formData.get('model')).toBe('gpt-image-2');
    expect(formData.get('size')).toBe('1024x1024');
    expect(formData.get('quality')).toBe('high');
    expect(formData.has('image')).toBe(true);
    expect(() => buildEditFormData({ prompt: 'edit', model: 'gpt-image-2', size: '1024x1024', quality: 'medium' }, null)).toThrow('Choose an image before editing.');
  });

  it('builds thumbnail URLs from history file names', async () => {
    const appModule = await import(modulePath);
    const getHistoryImageUrl = requiredFunction(appModule, 'getHistoryImageUrl');

    expect(getHistoryImageUrl({ fileName: 'result one.png' })).toBe('/api/images/result%20one.png');
    expect(getHistoryImageUrl({ status: 'failed' })).toBe('');
  });
});
