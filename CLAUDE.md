# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Common commands

```bash
npm install                  # install dependencies
npm run dev                  # start Express API and Vite dev server
npm run build                # production Vite build
npm run preview              # preview built frontend on 127.0.0.1
npm test                     # run all Vitest tests
npm test -- tests/cli.test.js # run one test file
npm run cli -- --help        # show CLI commands
```

Setup and local configuration:

```bash
./install.sh
npm run cli -- set-config --base-url "<base url>" --api-key "<api key>" --model gpt-image-2
npm run cli -- config
```

`npm run cli -- config` prints only safe config fields and masks the API key.

## Architecture overview

This repo is a local image-generation console plus a Claude Code skill installer.

- `src/server/` is the local Express API. `src/server/server.js` binds the API to `127.0.0.1:${PORT || 8787}` and starts Vite unless `NO_VITE=1`. `src/server/index.js` defines `/api/config`, `/api/generate`, `/api/edit`, `/api/history`, and static `/api/images` routes.
- `src/web/` is the Vite React console. It talks only to local `/api/*` routes for config, generation, editing, and history.
- `src/cli/index.js` exposes the same workflows through Commander commands: `config`, `set-config`, `generate`, and `edit`.
- `src/lib/` contains the shared runtime logic used by both server and CLI:
  - `paths.js` centralizes config, output, upload, image, and history paths.
  - `config.js` stores config at `~/.local-image-console/config.json`, masks keys for safe output, and tightens config permissions.
  - `history.js` stores newest-first history in `output/history.json` and serializes same-process writes.
  - `imageApi.js` calls OpenAI-compatible `/v1/images/generations` and `/v1/images/edits` endpoints and expects `data[0].b64_json` responses.
  - `imageService.js` orchestrates config defaults, API calls, image saving, history writes, upload-dir checks, image magic-byte validation, and MIME detection.
- `skills/local-image-skill/SKILL.md` is the distributable Claude Code skill template. It contains `__CLAUDE_IMAGE_ROOT__`; `install.sh` replaces that placeholder with the user's actual clone path before writing `~/.claude/skills/local-image-skill/SKILL.md`.

## Runtime data

Runtime data is intentionally local and ignored by git:

```text
output/images/      # generated and edited images
output/uploads/     # temporary copied/uploaded edit inputs
output/history.json # local generation/edit history
```

User API config is outside the repo:

```text
~/.local-image-console/config.json
```

## Image editing flow

The server writes browser uploads directly into `output/uploads` via Multer. The CLI copies arbitrary local `--image` inputs into `output/uploads` before calling the shared service. `imageService.editImage()` then verifies the resolved path is still inside `output/uploads` and accepts only PNG, JPEG, GIF, or WebP by magic bytes before sending the image to the configured API.

## README-relevant behavior

The public install path is:

```bash
git clone https://github.com/wang-sm520/Claude_image.git
cd Claude_image
./install.sh
```

The README states that image edits upload the source image to the configured image API, and that generated files live under `output/images/`.