#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SKILL_SRC="$ROOT_DIR/skills/local-image-skill/SKILL.md"
SKILL_DIR="$HOME/.claude/skills/local-image-skill"
SKILL_DST="$SKILL_DIR/SKILL.md"

if ! command -v node >/dev/null 2>&1; then
  echo "缺少 Node.js。请先安装 Node.js。" >&2
  exit 1
fi

if ! command -v npm >/dev/null 2>&1; then
  echo "缺少 npm。请先安装 npm。" >&2
  exit 1
fi

if [ ! -f "$SKILL_SRC" ]; then
  echo "找不到 skill 文件：$SKILL_SRC" >&2
  exit 1
fi

cd "$ROOT_DIR"
npm install

mkdir -p "$SKILL_DIR"
cp "$SKILL_SRC" "$SKILL_DST"

echo "安装完成。"
echo ""
echo "下一步：配置你自己的图片 API："
echo "  npm run cli -- set-config --base-url \"<base url>\" --api-key \"<api key>\" --model gpt-image-2"
echo ""
echo "启动网页控制台："
echo "  npm run dev"
echo ""
echo "Claude Code 中可以直接说：生成一张可爱的橘猫宇航员贴纸，干净 pastel 背景"
