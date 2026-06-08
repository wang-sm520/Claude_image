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
python3 - "$SKILL_SRC" "$SKILL_DST" "$ROOT_DIR" <<'PY'
from pathlib import Path
import sys

src = Path(sys.argv[1])
dst = Path(sys.argv[2])
root = sys.argv[3]
text = src.read_text()
if '__CLAUDE_IMAGE_ROOT__' not in text:
    raise SystemExit('skill 模板缺少 __CLAUDE_IMAGE_ROOT__ 占位符')
dst.write_text(text.replace('__CLAUDE_IMAGE_ROOT__', root))
PY

echo "安装完成。"
echo ""
echo "已安装 Claude Code skill：$SKILL_DST"
echo "本地项目路径：$ROOT_DIR"
echo ""
echo "下一步：配置你自己的图片 API："
echo "  npm run cli -- set-config --base-url \"<base url>\" --api-key \"<api key>\" --model gpt-image-2"
echo ""
echo "启动网页控制台："
echo "  npm run dev"
echo ""
echo "Claude Code 中可以直接说：生成一张可爱的橘猫宇航员贴纸，干净 pastel 背景"
