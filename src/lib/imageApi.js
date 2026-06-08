import { readFile } from 'node:fs/promises';
import path from 'node:path';

export function normalizeBaseUrl(baseUrl) {
  const normalized = baseUrl?.trim();
  if (!normalized) {
    throw new Error('Missing API base URL.');
  }
  return normalized.replace(/\/+$/, '');
}

export function extractImageBuffer(payload) {
  const b64 = payload?.data?.[0]?.b64_json;
  if (!b64) {
    throw new Error('Image API response did not contain b64_json image data.');
  }
  return Buffer.from(b64, 'base64');
}

async function parseApiResponse(response) {
  const text = await response.text();
  let payload;
  try {
    payload = JSON.parse(text);
  } catch {
    throw new Error(`Image API returned non-JSON response with status ${response.status}.`);
  }

  if (!response.ok) {
    const message = payload?.error?.message || payload?.message || `Image API request failed with status ${response.status}.`;
    throw new Error(message);
  }

  return extractImageBuffer(payload);
}

export async function callGenerateApi(config, request) {
  const response = await fetch(`${normalizeBaseUrl(config.baseUrl)}/v1/images/generations`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: request.model,
      prompt: request.prompt,
      size: request.size,
      quality: request.quality,
      n: 1
    })
  });

  return parseApiResponse(response);
}

export async function callEditApi(config, request) {
  const form = new FormData();
  const bytes = await readFile(request.imagePath);
  const blob = new Blob([bytes], { type: request.mimeType || 'image/png' });

  form.set('image', blob, path.basename(request.imagePath));
  form.set('prompt', request.prompt);

  for (const [key, value] of Object.entries({
    model: request.model,
    size: request.size,
    quality: request.quality
  })) {
    if (value !== undefined && value !== '') {
      form.set(key, value);
    }
  }

  form.set('n', '1');

  const response = await fetch(`${normalizeBaseUrl(config.baseUrl)}/v1/images/edits`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.apiKey}`
    },
    body: form
  });

  return parseApiResponse(response);
}
