# Claude Image

Claude Code 本地生图工具：一个网页控制台 + 一个 Claude Code skill。

你可以在 Claude Code 里直接说“生图 / 画图 / 生成图片 / 改图”，它会调用本地控制台，把图片保存到本机。

## 需要准备

- Claude Code
- Node.js 和 npm
- 一个兼容 OpenAI 图片接口的 API：
  - `POST /v1/images/generations`
  - `POST /v1/images/edits`
  - 返回 `data[0].b64_json`
- 你自己的 `baseUrl` 和 `apiKey`

## 安装

```bash
git clone https://github.com/wang-sm520/Claude_image.git
cd Claude_image
./install.sh
```

`install.sh` 会安装依赖，并把 skill 安装到：

```text
~/.claude/skills/local-image-skill/SKILL.md
```

安装时会把 skill 里的项目路径替换成你当前 clone 的目录，所以不同设备不需要使用相同路径。

## 配置 API

不要把 API key 提交到 GitHub。每个人都在自己电脑上配置：

```bash
npm run cli -- set-config --base-url "<base url>" --api-key "<api key>" --model gpt-image-2
```

检查配置：

```bash
npm run cli -- config
```

这个命令只会显示 masked key，不会打印完整 API key。

## 在 Claude Code 里使用

直接说：

```text
生成一张可爱的橘猫宇航员贴纸，干净 pastel 背景，用 gpt-image-2
```

或者：

```text
把 /path/to/image.png 改成可爱贴纸风格
```

图片编辑会把图片上传到你配置的 API。Claude Code 会先让你确认上传风险。

## 网页控制台

```bash
npm run dev
```

打开：

```text
http://127.0.0.1:5173
```

网页里可以配置 API、生成图片、编辑图片、查看历史。

## CLI 用法

生成图片：

```bash
npm run cli -- generate "Cute orange cat astronaut sticker, pastel background"
```

编辑图片：

```bash
npm run cli -- edit --image "/path/to/image.png" --prompt "Make it a cute sticker"
```

查看安全配置：

```bash
npm run cli -- config
```

## 输出位置

生成和编辑后的图片保存在：

```text
output/images/
```

历史记录在：

```text
output/history.json
```

这些都是本地运行数据，不要提交到 GitHub。

## 安全说明

- 不要提交 API key。
- API key 保存在本机：`~/.local-image-console/config.json`。
- 配置文件会使用较严格权限保存。
- 图片编辑会上传原图到你配置的图片 API。
- 不要上传敏感图片，除非你信任自己的 API 服务。
