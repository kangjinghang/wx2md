# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

wx2md is a Node.js CLI tool that converts WeChat Official Account (微信公众号) articles to local Markdown files with image downloading. No login required — it fetches public articles directly from WeChat's CDN.

## Commands

```bash
npm install                  # Install dependencies
node cli.mjs <url>           # Run the tool
node cli.mjs --help          # Show usage options
```

No build step, no test suite. The tool runs directly via `node cli.mjs`.

## Architecture

Single-file CLI application (`cli.mjs`) with three serverless proxy implementations for image hosting.

### Core Pipeline (`cli.mjs`)

1. **CLI arg parsing** (`parseArgs`) — handles `--file`, `--output`, `--img`, `--img-mode`, `--proxy`
2. **Fetch** (`fetchArticleHtml`) — retrieves HTML with WeChat-specific headers (Referer, User-Agent)
3. **Parse** (`parseArticle`) — Cheerio-based extraction of title, author, date, description, cover image, and content from `#js_content`; removes ads/QR codes; replaces special content (video, audio, mini-programs, etc.) with text placeholders; converts inline styles (font-weight, font-style) to semantic HTML tags; removes image `height` attributes; extracts image URLs from `data-src` attributes
4. **Image processing** — two modes:
   - **Local mode**: downloads images concurrently (batch of 3) with retry logic, saves to `output/assets/<article-title>/`
   - **Proxy mode**: rewrites image URLs to point at a deployed proxy, no local download
5. **Markdown conversion** (`htmlToMarkdown`) — TurndownService with YAML frontmatter (title, author, date, description, cover, source)
6. **Output** — one md file per article (`output/<title>.md`) + optional `assets/` folder

### Key WeChat-specific Details

- WeChat images use `data-src` instead of `src` — the parser converts these before Turndown processes them
- Image URLs contain HTML entities (`&amp;`) that need decoding for matching
- WeChat has two image sizes: original (`/0`) and compressed (`/640`)
- Anti-hotlink bypass requires correct `Referer: https://mp.weixin.qq.com/` header on image requests
- Error detection via `var ret` error codes and `weui-msg` component (deleted, under review, etc.)

### Image Proxy (`netlify/`, `vercel/`, `worker/`)

Three identical proxy implementations for different platforms. All:
- Accept `?url=<encoded_image_url>` parameter
- Validate domain is in allowed list (`mmbiz.qpic.cn`, `mmbiz.qlogo.cn`, `mmecoa.qpic.cn`)
- Forward requests with proper Referer header
- Return CORS headers and 1-year cache TTL

## Dependencies

- **cheerio** — server-side DOM parsing
- **turndown** — HTML to Markdown conversion
- Requires Node.js >= 22 (ES modules)
