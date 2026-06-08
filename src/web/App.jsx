import { useEffect, useMemo, useState } from 'react';

const DEFAULT_CONFIG = {
  baseUrl: '',
  hasApiKey: false,
  apiKeyPreview: '',
  model: 'gpt-image-2',
  size: '1024x1024',
  quality: 'medium'
};

const SIZE_OPTIONS = ['1024x1024', '1024x1536', '1536x1024', 'auto'];
const QUALITY_OPTIONS = ['low', 'medium', 'high', 'auto'];

async function readJsonResponse(response) {
  let payload = {};

  try {
    payload = await response.json();
  } catch {
    payload = {};
  }

  if (!response.ok) {
    const error = new Error(payload.error || `Request failed with status ${response.status}.`);
    if (payload.historyItem) {
      error.historyItem = payload.historyItem;
    }
    throw error;
  }

  return payload;
}

function normalizeConfig(config = {}) {
  return {
    ...DEFAULT_CONFIG,
    ...config,
    apiKeyPreview: config.apiKeyPreview || '',
    hasApiKey: Boolean(config.hasApiKey)
  };
}

function requestFields(config) {
  return {
    model: config.model?.trim() || DEFAULT_CONFIG.model,
    size: config.size?.trim() || DEFAULT_CONFIG.size,
    quality: config.quality?.trim() || DEFAULT_CONFIG.quality
  };
}

export function buildConfigPayload(config, apiKey) {
  const payload = {
    baseUrl: config.baseUrl?.trim() || '',
    ...requestFields(config)
  };
  const trimmedApiKey = apiKey.trim();

  if (trimmedApiKey) {
    payload.apiKey = trimmedApiKey;
  }

  return payload;
}

export async function loadInitialData(fetchImpl = globalThis.fetch) {
  const [configResponse, historyResponse] = await Promise.all([
    fetchImpl('/api/config'),
    fetchImpl('/api/history')
  ]);

  const [config, history] = await Promise.all([
    readJsonResponse(configResponse),
    readJsonResponse(historyResponse)
  ]);

  return {
    config: normalizeConfig(config),
    history: Array.isArray(history) ? history : []
  };
}

export async function postConfig(fetchImpl = globalThis.fetch, config, apiKey) {
  const response = await fetchImpl('/api/config', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(buildConfigPayload(config, apiKey))
  });

  return normalizeConfig(await readJsonResponse(response));
}

export async function postGenerate(fetchImpl = globalThis.fetch, request) {
  const response = await fetchImpl('/api/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      prompt: request.prompt.trim(),
      model: request.model,
      size: request.size,
      quality: request.quality
    })
  });

  return readJsonResponse(response);
}

export function buildEditFormData(request, image) {
  if (!image) {
    throw new Error('Choose an image before editing.');
  }

  const formData = new FormData();
  formData.set('prompt', request.prompt.trim());
  formData.set('model', request.model);
  formData.set('size', request.size);
  formData.set('quality', request.quality);

  if (image.name) {
    formData.set('image', image, image.name);
  } else {
    formData.set('image', image);
  }

  return formData;
}

export async function postEdit(fetchImpl = globalThis.fetch, request, image) {
  const response = await fetchImpl('/api/edit', {
    method: 'POST',
    body: buildEditFormData(request, image)
  });

  return readJsonResponse(response);
}

export function getHistoryImageUrl(item) {
  if (!item?.fileName) {
    return '';
  }

  return `/api/images/${encodeURIComponent(item.fileName)}`;
}

function mergeHistoryItem(items, item) {
  if (!item) return items;
  return [item, ...items.filter((existing) => existing.id !== item.id)];
}

function StatusMessage({ status }) {
  if (!status.text) return null;

  return (
    <p className={`status-line ${status.type}`} role={status.type === 'error' ? 'alert' : 'status'}>
      {status.text}
    </p>
  );
}

function HistoryItem({ item }) {
  const imageUrl = getHistoryImageUrl(item);
  const prompt = item.prompt || item.params?.prompt || 'No prompt recorded.';

  return (
    <li className="history-card">
      {imageUrl ? (
        <img className="history-thumb" src={imageUrl} alt={prompt} loading="lazy" />
      ) : (
        <div className="history-thumb placeholder">No image</div>
      )}
      <div className="history-body">
        <div className="history-heading">
          <span className={`badge ${item.status || 'unknown'}`}>{item.status || 'unknown'}</span>
          {item.type ? <span className="history-type">{item.type}</span> : null}
        </div>
        <p className="history-prompt">{prompt}</p>
        {item.outputPath ? <p className="history-meta"><strong>Output:</strong> {item.outputPath}</p> : null}
        {item.error ? <p className="history-error"><strong>Error:</strong> {item.error}</p> : null}
      </div>
    </li>
  );
}

export function App({ fetchImpl = globalThis.fetch }) {
  const [config, setConfig] = useState(DEFAULT_CONFIG);
  const [apiKey, setApiKey] = useState('');
  const [history, setHistory] = useState([]);
  const [mode, setMode] = useState('generate');
  const [prompt, setPrompt] = useState('');
  const [image, setImage] = useState(null);
  const [fileInputKey, setFileInputKey] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [status, setStatus] = useState({ type: 'idle', text: '' });

  useEffect(() => {
    let isMounted = true;

    async function load() {
      setIsLoading(true);
      try {
        const next = await loadInitialData(fetchImpl);
        if (!isMounted) return;
        setConfig(next.config);
        setHistory(next.history);
        setStatus({ type: 'success', text: 'Ready.' });
      } catch (error) {
        if (!isMounted) return;
        setStatus({ type: 'error', text: error.message });
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    load();

    return () => {
      isMounted = false;
    };
  }, [fetchImpl]);

  const generationRequest = useMemo(() => ({
    prompt,
    ...requestFields(config)
  }), [config, prompt]);

  function updateConfig(field, value) {
    setConfig((current) => ({ ...current, [field]: value }));
  }

  async function saveConfig(event) {
    event.preventDefault();
    setIsSaving(true);
    setStatus({ type: 'info', text: 'Saving config...' });

    try {
      const saved = await postConfig(fetchImpl, config, apiKey);
      setConfig(saved);
      setApiKey('');
      setStatus({ type: 'success', text: 'Config saved.' });
    } catch (error) {
      setStatus({ type: 'error', text: error.message });
    } finally {
      setIsSaving(false);
    }
  }

  async function submitImageRequest(event) {
    event.preventDefault();

    if (!prompt.trim()) {
      setStatus({ type: 'error', text: 'Enter a prompt.' });
      return;
    }

    if (mode === 'edit' && !image) {
      setStatus({ type: 'error', text: 'Choose an image before editing.' });
      return;
    }

    setIsSubmitting(true);
    setStatus({ type: 'info', text: mode === 'edit' ? 'Editing image...' : 'Generating image...' });

    try {
      const item = mode === 'edit'
        ? await postEdit(fetchImpl, generationRequest, image)
        : await postGenerate(fetchImpl, generationRequest);

      setHistory((items) => mergeHistoryItem(items, item));
      setPrompt('');
      if (mode === 'edit') {
        setImage(null);
        setFileInputKey((key) => key + 1);
      }
      setStatus({ type: 'success', text: mode === 'edit' ? 'Edit complete.' : 'Generation complete.' });
    } catch (error) {
      if (error.historyItem) {
        setHistory((items) => mergeHistoryItem(items, error.historyItem));
      }
      setStatus({ type: 'error', text: error.message });
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="shell">
      <header className="hero">
        <div>
          <p className="eyebrow">Local console</p>
          <h1>Local Image Console</h1>
          <p>Configure your image API, generate images, edit uploads, and browse local history.</p>
        </div>
        <StatusMessage status={status} />
      </header>

      <div className="layout">
        <section className="panel config-panel" aria-labelledby="config-heading">
          <div className="panel-heading">
            <h2 id="config-heading">Config</h2>
            {isLoading ? <span className="muted">Loading...</span> : null}
          </div>
          <form className="form-grid" onSubmit={saveConfig}>
            <label>
              <span>Base URL</span>
              <input
                value={config.baseUrl}
                onChange={(event) => updateConfig('baseUrl', event.target.value)}
                placeholder="https://api.example.com"
              />
            </label>

            <label>
              <span>API key</span>
              <input
                type="password"
                value={apiKey}
                onChange={(event) => setApiKey(event.target.value)}
                placeholder={config.hasApiKey ? 'Leave blank to keep saved key' : 'Paste an API key'}
                autoComplete="off"
              />
              <small>
                {config.hasApiKey
                  ? `Saved key: ${config.apiKeyPreview || 'configured'}`
                  : 'No key saved yet.'}
              </small>
            </label>

            <label>
              <span>Model</span>
              <input
                value={config.model}
                onChange={(event) => updateConfig('model', event.target.value)}
                placeholder={DEFAULT_CONFIG.model}
              />
            </label>

            <label>
              <span>Size</span>
              <select value={config.size} onChange={(event) => updateConfig('size', event.target.value)}>
                {SIZE_OPTIONS.map((size) => <option key={size} value={size}>{size}</option>)}
              </select>
            </label>

            <label>
              <span>Quality</span>
              <select value={config.quality} onChange={(event) => updateConfig('quality', event.target.value)}>
                {QUALITY_OPTIONS.map((quality) => <option key={quality} value={quality}>{quality}</option>)}
              </select>
            </label>

            <button type="submit" disabled={isSaving}>{isSaving ? 'Saving...' : 'Save config'}</button>
          </form>
        </section>

        <section className="panel request-panel" aria-labelledby="request-heading">
          <div className="panel-heading">
            <h2 id="request-heading">Generate / Edit</h2>
          </div>
          <form onSubmit={submitImageRequest} className="request-form">
            <div className="mode-switch" role="radiogroup" aria-label="Image request mode">
              <label className={mode === 'generate' ? 'active' : ''}>
                <input
                  type="radio"
                  name="mode"
                  value="generate"
                  checked={mode === 'generate'}
                  onChange={() => setMode('generate')}
                />
                Generate
              </label>
              <label className={mode === 'edit' ? 'active' : ''}>
                <input
                  type="radio"
                  name="mode"
                  value="edit"
                  checked={mode === 'edit'}
                  onChange={() => setMode('edit')}
                />
                Edit
              </label>
            </div>

            <label>
              <span>Prompt</span>
              <textarea
                value={prompt}
                onChange={(event) => setPrompt(event.target.value)}
                placeholder="Describe the image you want."
                rows="6"
              />
            </label>

            {mode === 'edit' ? (
              <label>
                <span>Image upload</span>
                <input
                  key={fileInputKey}
                  type="file"
                  accept="image/png,image/jpeg,image/gif,image/webp"
                  required
                  onChange={(event) => setImage(event.target.files?.[0] || null)}
                />
                <small>{image ? image.name : 'Required in edit mode.'}</small>
              </label>
            ) : null}

            <button type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Submitting...' : mode === 'edit' ? 'Submit edit' : 'Submit generate'}
            </button>
          </form>
        </section>
      </div>

      <section className="panel history-panel" aria-labelledby="history-heading">
        <div className="panel-heading">
          <h2 id="history-heading">History</h2>
          <span className="muted">{history.length} item{history.length === 1 ? '' : 's'}</span>
        </div>
        {history.length ? (
          <ul className="history-list">
            {history.map((item) => <HistoryItem key={item.id || `${item.fileName}-${item.createdAt}`} item={item} />)}
          </ul>
        ) : (
          <p className="empty-state">No image history yet.</p>
        )}
      </section>
    </main>
  );
}
