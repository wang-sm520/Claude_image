---
name: local-image
description: Use first whenever the user asks to generate, create, draw, edit, or modify bitmap images, especially for Chinese requests like 生图, 画图, 生成图片, 做张图, 改图, 编辑图片, or when the user mentions gpt-image-2/local image API. Prefer this local workflow over api2img-skill unless the user explicitly asks for api2img.
---

# Local Image

## Priority

Use this skill before other image-generation paths when the user asks to generate, create, draw, edit, or modify bitmap images, unless they explicitly request another provider such as api2img.

This skill uses the local image console at:

```text
/Users/amiao/local-image-console
```

Do not modify `api2img-skill`. It remains a fallback.

## Integration

Use the local console CLI:

```bash
npm --prefix /Users/amiao/local-image-console run cli -- config
npm --prefix /Users/amiao/local-image-console run cli -- generate "<prompt>"
npm --prefix /Users/amiao/local-image-console run cli -- edit --image "<path>" --prompt "<prompt>"
```

The CLI stores full API credentials locally and prints only safe masked config. Do not read, print, or log the full API key.

## Configuration Check

Before generation or editing, check configuration:

```bash
npm --prefix /Users/amiao/local-image-console run cli -- config
```

If the command fails, or if config shows no base URL or no API key, tell the user to configure the local console.

Web setup:

```bash
cd /Users/amiao/local-image-console
npm run dev
```

Then open:

```text
http://127.0.0.1:5173
```

CLI setup:

```bash
cd /Users/amiao/local-image-console
npm run cli -- set-config --base-url "<base url>" --api-key "<api key>" --model gpt-image-2
```

Do not ask the user to paste an API key into chat unless they choose to. Never print the key back.

## Text-to-Image Workflow

For text image generation:

1. Preserve the user's intent.
2. Shape a concise structured prompt when useful.
3. Run:

```bash
npm --prefix /Users/amiao/local-image-console run cli -- generate "<prompt>"
```

4. Use a 300000 ms timeout for the first attempt.
5. If the command succeeds, capture the printed image path.
6. Use the Read tool on the image path to preview/inspect the image.
7. Reply with the saved path and mention that `local-image-skill` used `/Users/amiao/local-image-console`.

## Image Editing Workflow

For image edits or modifications using a user-provided local image path, pause before upload and say exactly:

```text
提示：你上传的图片可能会被第三方 API 获取，请注意自己的信息安全。请回复确认继续，我再上传图片进行修改。
```

After the user confirms, run:

```bash
npm --prefix /Users/amiao/local-image-console run cli -- edit --image "<path>" --prompt "<prompt>"
```

Then read/preview the output image path and report it.

Do not edit sensitive images unless the user explicitly confirms the configured API is trusted for that content.

## History Workflow

When the user asks for history, recent images, or previous generated outputs, read:

```text
/Users/amiao/local-image-console/output/history.json
```

Summarize recent items without exposing secrets. Read image previews only for specific generated image paths when useful.

## Output

Generated and edited images are saved under:

```text
/Users/amiao/local-image-console/output/images
```

Always report absolute output paths. Do not overwrite, move, or delete generated files unless the user asks.

## Reliability

Image generation can take several minutes.

- Start with a 300000 ms timeout for one generation/edit attempt.
- If a command times out, do not assume failure.
- Check `/Users/amiao/local-image-console/output/images` and `/Users/amiao/local-image-console/output/history.json` for a newly created output before retrying.
- If no output exists, retry at most once automatically with a longer timeout of 480000 ms.
- If it still fails, report a redacted error summary and suggest checking the configured base URL, API key, upstream provider, or network.

## Privacy and Safety

- Image prompts are sent to the configured image API.
- Image edits upload the input image to the configured image API.
- Do not use this skill for sensitive images or prompts unless the user explicitly confirms the configured API is trusted for that content.
- Do not create extra logs containing prompts, image paths, API responses, or credentials.
- Before showing any CLI/API error to the user, redact API keys, Authorization headers, request bodies, response bodies, prompts, local image paths, and credentials. Prefer a short category such as configuration error, API error, network error, timeout, or missing output.
- Do not read or print `/Users/amiao/.local-image-console/config.json` directly.

## Error Handling

- Missing local console project: say `/Users/amiao/local-image-console` is missing and the local console must be installed first.
- Missing config: show the web/CLI setup commands from Configuration Check.
- API/network failure: report only a redacted CLI error summary and suggest checking base URL, key, upstream provider, or network.
- Image edit without confirmation: stop and ask for confirmation.
