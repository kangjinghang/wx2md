---
name: wx2md
description: "Convert WeChat Official Account (微信公众号) articles to local Markdown files with images. Use this when the user provides a mp.weixin.qq.com URL and wants it saved as Markdown, says '保存文章', '导出微信文章', '转成 Markdown', wants to batch-export articles, or archive WeChat content for offline reading or AI processing."
compatibility: Requires Node.js 22+ and internet access
metadata:
  author: kangjinghang
  version: "1.0"
allowed-tools: Bash(node:*) Bash(npm:*) Read Write
---

# wx2md

Convert WeChat Official Account articles to clean Markdown with YAML front matter and local images.

## When to use

- User provides a `mp.weixin.qq.com` URL and wants it as a Markdown file
- User says "帮我保存这篇文章", "导出微信文章", "转成 Markdown" with a WeChat link
- User has multiple article URLs to process in batch
- User wants to archive WeChat articles for offline reading

## Setup

Run once before first use:

```bash
cd scripts && npm install
```

## Quick start

```bash
node scripts/wx2md.mjs "https://mp.weixin.qq.com/s/xxxxx"
```

## Available scripts

- **`scripts/wx2md.mjs`** — Main CLI script. Requires `npm install` in `scripts/` to resolve cheerio and turndown dependencies.

## Commands

Single article:

```bash
node scripts/wx2md.mjs "https://mp.weixin.qq.com/s/xxxxx"
```

Specify output directory:

```bash
node scripts/wx2md.mjs -o ~/articles "https://mp.weixin.qq.com/s/xxxxx"
```

Compressed images (640px):

```bash
node scripts/wx2md.mjs --img compressed "https://mp.weixin.qq.com/s/xxxxx"
```

Image proxy mode (no local download):

```bash
node scripts/wx2md.mjs --proxy https://your-proxy.netlify.app "https://mp.weixin.qq.com/s/xxxxx"
```

Batch from file:

```bash
node scripts/wx2md.mjs --file urls.txt
```

Combine options:

```bash
node scripts/wx2md.mjs -o ~/articles --img compressed --file urls.txt
```

## Workflow

1. If not yet installed, run `cd scripts && npm install`.
2. Run `node scripts/wx2md.mjs` with the article URL and desired options.
3. Read the generated Markdown file from the output directory.
4. Report the file path to the user.

## Options

| Flag | Short | Description | Default |
|---|---|---|---|
| `--file <path>` | `-f` | Read URLs from text file (one per line) | - |
| `--output <dir>` | `-o` | Output directory | `./output` |
| `--img <quality>` | `-i` | `original` or `compressed` | `original` |
| `--img-mode <mode>` | | `local` (download) or `proxy` (online) | `local` |
| `--proxy <url>` | | Proxy base URL (enables proxy mode) | - |
| `--help` | `-h` | Show help | - |

## Output

Each article produces one `.md` file with YAML front matter:

```yaml
---
title: "Article Title"
author: "Account Name"
date: "2026-05-08"
description: "Article summary"
cover: "https://mmbiz.qpic.cn/..."
source: "https://mp.weixin.qq.com/s/xxxxx"
---

Article content with ![images](assets/001.jpeg)...
```

Local mode saves images to `assets/<article-title>/`. Proxy mode keeps image URLs pointing at the proxy server.

## Error handling

- Invalid/expired URL → "Article URL is invalid or expired"
- Deleted article → "Article has been deleted by the author"
- Under review → "Article is under review"
- Failed image downloads are skipped with a warning; the Markdown file is still generated.
- Exit code 1 if any article fails in batch mode.

## Limitations

- Only public articles (no login/paywall support).
- Two image sizes: original (`/0`) and compressed (`/640`).
- Article URLs may expire over time.
- Special content (video, audio, mini-programs, votes, products) replaced with placeholders like `[video]`, `[music]`, `[mini-program]`.

## Image proxy

To keep images online instead of downloading, deploy a proxy and use `--proxy <url>`. Pre-built proxy code for Netlify, Vercel, and Cloudflare Workers is available in the project repository.
