---
name: wx2md
description: Convert WeChat Official Account (微信公众号) articles to local Markdown files with images. Use this whenever the user wants to save, archive, or convert a WeChat article URL to Markdown, or batch-export multiple articles.
---

# wx2md

Use `wx2md` when the user wants to:

- convert a WeChat Official Account article URL to a local Markdown file
- batch-export multiple WeChat articles
- download WeChat article images locally or via proxy
- archive WeChat articles for offline reading or AI processing

## Intent Routing

- If the user provides a `mp.weixin.qq.com` URL and wants it saved as Markdown → use `wx2md`.
- If the user says "帮我保存这篇文章", "导出微信文章", "转成 Markdown" with a WeChat link → use `wx2md`.
- If the user has a list of URLs to process → use `--file` batch mode.
- If the user wants images kept online (no local download) → use `--proxy` mode.

## Defaults And Config

- Assume `wx2md` is run via `node cli.mjs` from the project root, or `npx wx2md` if installed globally.
- Default output directory: `./output`.
- Default image quality: `original` (full resolution).
- Default image mode: `local` (download images to disk).
- No login or authentication required for public articles.

## Core Commands

Single article conversion:

```bash
node cli.mjs "https://mp.weixin.qq.com/s/xxxxx"
```

Specify output directory:

```bash
node cli.mjs -o ~/articles "https://mp.weixin.qq.com/s/xxxxx"
```

Compressed images (640px, smaller file size):

```bash
node cli.mjs --img compressed "https://mp.weixin.qq.com/s/xxxxx"
```

Image proxy mode (no local image storage):

```bash
node cli.mjs --proxy https://your-proxy.netlify.app "https://mp.weixin.qq.com/s/xxxxx"
```

Batch processing from URL list file:

```bash
node cli.mjs --file urls.txt
```

Combine options:

```bash
node cli.mjs -o ~/articles --img compressed --file urls.txt
node cli.mjs -o ~/articles --proxy https://your-proxy.netlify.app --file urls.txt
```

## Options

| Flag | Short | Description | Default |
|---|---|---|---|
| `--file <path>` | `-f` | Read URL list from a text file (one URL per line) | - |
| `--output <dir>` | `-o` | Output directory | `./output` |
| `--img <quality>` | `-i` | Image quality: `original` or `compressed` | `original` |
| `--img-mode <mode>` | | Image mode: `local` (download) or `proxy` (online) | `local` |
| `--proxy <url>` | | Image proxy base URL (enables proxy mode) | - |
| `--help` | `-h` | Show help | - |

## Output

Each article produces one `.md` file with YAML front matter:

```yaml
---
title: "文章标题"
author: "公众号名称"
date: "2026-05-08"
description: "文章摘要"
cover: "https://mmbiz.qpic.cn/..."
source: "https://mp.weixin.qq.com/s/xxxxx"
---
```

In local mode, images are saved to `assets/<article-title>/` subdirectory alongside the Markdown file. In proxy mode, image URLs point to the proxy server.

## Agent Workflow

1. User provides a WeChat article URL (or a file of URLs).
2. Run `node cli.mjs` with the URL and desired options.
3. Read the generated Markdown file from the output directory.
4. Present the file path to the user.

Example agent interaction:

```
User: 帮我把这篇文章转成 Markdown https://mp.weixin.qq.com/s/xxxxx
Agent: node cli.mjs -o ~/articles "https://mp.weixin.qq.com/s/xxxxx"
Agent: 已保存到 ~/articles/文章标题.md，共 5 张图片已下载。
```

## Error Handling

- If the article URL is invalid or expired, the tool reports "文章链接无效或已过期".
- If the article has been deleted, the tool reports "文章已被作者删除".
- If the article is under review, the tool reports "文章正在审核中".
- Failed image downloads are skipped with a warning; the Markdown file is still generated.
- The tool processes all URLs in batch mode and reports success/failure counts at the end.

## Limitations

- Only public WeChat articles are supported (login/paywall articles are not supported).
- WeChat images have two sizes: original (`/0`) and compressed (`/640`).
- Article URLs may expire over time.
- Special content (video, audio, mini-programs, votes, products) is replaced with text placeholders like `[视频]`, `[音乐]`, `[小程序]`.

## Image Proxy

To avoid downloading images locally, deploy a proxy (Netlify, Vercel, or Cloudflare Worker) and use `--proxy`. Pre-built proxy code is in the `netlify/`, `vercel/`, and `worker/` directories of the project.
