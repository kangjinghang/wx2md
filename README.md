# wx2md

A CLI tool to convert WeChat Official Account (微信公众号) articles to local Markdown files with images downloaded.

No login required. Just paste a URL and go.

## Features

- Convert WeChat articles to clean Markdown with YAML front matter
- Download images locally (original or compressed quality)
- Batch processing from a URL list file
- No login or authentication needed for public articles
- Agent-friendly CLI interface

## Requirements

- Node.js >= 22

## Install

```bash
git clone https://github.com/kangjinghang/wx2md.git
cd wx2md
npm install
```

## Usage

```bash
# Single article (downloads original images by default)
node cli.mjs "https://mp.weixin.qq.com/s/xxxxx"

# Specify output directory
node cli.mjs -o ~/articles "https://mp.weixin.qq.com/s/xxxxx"

# Download compressed images (640px, smaller file size)
node cli.mjs --img compressed "https://mp.weixin.qq.com/s/xxxxx"

# Batch processing (one URL per line)
node cli.mjs --file urls.txt

# Combine options
node cli.mjs -o ~/articles --img compressed --file urls.txt
```

### Options

| Flag | Short | Description | Default |
|---|---|---|---|
| `--file <path>` | `-f` | Read URL list from a text file (one URL per line) | - |
| `--output <dir>` | `-o` | Output directory | `./output` |
| `--img <quality>` | `-i` | Image quality: `original` or `compressed` | `original` |
| `--help` | `-h` | Show help | - |

### Output Structure

```
output/
└── Article Title/
    ├── index.md        # Markdown with YAML front matter + local image paths
    └── assets/
        ├── 001.jpeg
        ├── 002.png
        └── ...
```

### Markdown Output Example

```markdown
---
title: "Article Title"
author: "Account Name"
source: "https://mp.weixin.qq.com/s/xxxxx"
---

Article content with ![images](assets/001.jpeg) converted to Markdown...
```

## How It Works

1. Fetches article HTML from WeChat's CDN with proper headers (no login needed)
2. Extracts and cleans the article content using Cheerio
3. Downloads all images with anti-hotlink bypass (correct Referer header)
4. Converts HTML to Markdown using Turndown
5. Replaces remote image URLs with local paths
6. Saves everything to disk

## Limitations

- Only works with **public** WeChat articles (articles behind login/paywall are not supported)
- WeChat only supports two image sizes: original (`/0`) and compressed (`/640`, 640px width)
- Article URLs may expire over time

## License

MIT

---

# wx2md

一个将微信公众号文章转换为本地 Markdown 文件的命令行工具，图片自动下载到本地。

无需登录，粘贴链接即可使用。

## 功能特性

- 将微信文章转换为干净的 Markdown，附带 YAML front matter
- 图片下载到本地（支持原图和压缩图）
- 支持从文件批量导入 URL
- 公开文章无需登录认证
- 命令行接口，方便接入 AI Agent

## 环境要求

- Node.js >= 22

## 安装

```bash
git clone https://github.com/kangjinghang/wx2md.git
cd wx2md
npm install
```

## 使用方法

```bash
# 单篇文章（默认下载原图）
node cli.mjs "https://mp.weixin.qq.com/s/xxxxx"

# 指定输出目录
node cli.mjs -o ~/articles "https://mp.weixin.qq.com/s/xxxxx"

# 下载压缩图（640px，体积更小）
node cli.mjs --img compressed "https://mp.weixin.qq.com/s/xxxxx"

# 批量处理（文本文件，一行一个 URL）
node cli.mjs --file urls.txt

# 组合使用
node cli.mjs -o ~/articles --img compressed --file urls.txt
```

### 参数说明

| 参数 | 缩写 | 说明 | 默认值 |
|---|---|---|---|
| `--file <path>` | `-f` | 从文本文件读取 URL 列表（一行一个） | - |
| `--output <dir>` | `-o` | 输出目录 | `./output` |
| `--img <quality>` | `-i` | 图片质量：`original`（原图）或 `compressed`（压缩） | `original` |
| `--help` | `-h` | 显示帮助信息 | - |

### 输出目录结构

```
output/
└── 文章标题/
    ├── index.md        # Markdown 文件（含 front matter + 本地图片路径）
    └── assets/
        ├── 001.jpeg
        ├── 002.png
        └── ...
```

### Markdown 输出示例

```markdown
---
title: "文章标题"
author: "公众号名称"
source: "https://mp.weixin.qq.com/s/xxxxx"
---

文章内容，图片已转为本地路径 ![图片](assets/001.jpeg)...
```

## 工作原理

1. 带正确的请求头直接请求微信 CDN，获取文章 HTML（无需登录）
2. 使用 Cheerio 提取并清理文章正文内容
3. 带正确的 Referer 头下载所有图片，绕过防盗链
4. 使用 Turndown 将 HTML 转换为 Markdown
5. 将远程图片 URL 替换为本地路径
6. 保存到磁盘

## 限制

- 仅支持**公开**的微信公众号文章（需要登录或付费的文章不支持）
- 微信图片只有两种尺寸：原图（`/0`）和压缩图（`/640`，640px 宽度）
- 文章链接可能会过期失效

## 许可证

MIT
