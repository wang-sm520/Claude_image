import { mkdir } from 'node:fs/promises';
import express from 'express';
import multer from 'multer';
import { configStore } from '../lib/config.js';
import { historyStore } from '../lib/history.js';
import { editImage, generateImage } from '../lib/imageService.js';
import { paths } from '../lib/paths.js';

const upload = multer({
  storage: multer.diskStorage({
    destination: async (_request, _file, callback) => {
      try {
        await mkdir(paths.uploadDir, { recursive: true });
        callback(null, paths.uploadDir);
      } catch (error) {
        callback(error);
      }
    }
  })
});

function handleServiceError(response, error) {
  response.status(400).json({
    error: error.message,
    historyItem: error.historyItem
  });
}

async function buildConfigUpdate(requestConfig) {
  const apiKey = typeof requestConfig.apiKey === 'string' ? requestConfig.apiKey.trim() : '';

  if (apiKey) {
    return { ...requestConfig, apiKey };
  }

  const currentConfig = await configStore.readConfig();
  return { ...requestConfig, apiKey: currentConfig.apiKey };
}

export function createApp() {
  const app = express();

  app.use(express.json({ limit: '2mb' }));

  app.get('/api/config', async (_request, response, next) => {
    try {
      response.json(await configStore.readSafeConfig());
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/config', async (request, response, next) => {
    try {
      await configStore.writeConfig(await buildConfigUpdate(request.body));
      response.json(await configStore.readSafeConfig());
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/generate', async (request, response, next) => {
    try {
      response.json(await generateImage(request.body));
    } catch (error) {
      if (error instanceof Error) {
        handleServiceError(response, error);
        return;
      }

      next(error);
    }
  });

  app.post('/api/edit', upload.single('image'), async (request, response, next) => {
    try {
      if (!request.file) {
        response.status(400).json({ error: 'Upload an image before editing.' });
        return;
      }

      response.json(await editImage({
        prompt: request.body.prompt,
        model: request.body.model,
        size: request.body.size,
        quality: request.body.quality,
        imagePath: request.file.path,
        mimeType: request.file.mimetype
      }));
    } catch (error) {
      if (error instanceof Error) {
        handleServiceError(response, error);
        return;
      }

      next(error);
    }
  });

  app.get('/api/history', async (_request, response, next) => {
    try {
      response.json(await historyStore.readHistory());
    } catch (error) {
      next(error);
    }
  });

  app.use('/api/images', express.static(paths.imageDir));

  app.use((error, _request, response, _next) => {
    response.status(500).json({ error: error instanceof Error ? error.message : String(error) });
  });

  return app;
}
