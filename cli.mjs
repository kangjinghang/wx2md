#!/usr/bin/env node

/**
 * wx2md - 微信公众号文章转 Markdown 工具
 *
 * Usage:
 *   npx wx2md "https://mp.weixin.qq.com/s/xxxxx"
 *   npx wx2md --file urls.txt
 *   npx wx2md -o ~/articles "https://mp.weixin.qq.com/s/xxxxx"
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import { join, extname, resolve } from 'node:path';
import { readFile } from 'node:fs/promises';
import * as cheerio from 'cheerio';
import TurndownService from 'turndown';

const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/117.0.0.0 Safari/537.36 WAE/1.0';

const REQUEST_HEADERS = {
  'User-Agent': USER_AGENT,
  Referer: 'https://mp.weixin.qq.com/',
  Origin: 'https://mp.weixin.qq.com',
};

// ─── 参数解析 ────────────────────────────────────────────

function parseArgs(args) {
  const options = { output: './output', file: null, urls: [], imgQuality: 'original', imgMode: 'local', proxy: null };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--file' || arg === '-f') {
      options.file = args[++i];
    } else if (arg === '--output' || arg === '-o') {
      options.output = args[++i];
    } else if (arg === '--img' || arg === '-i') {
      options.imgQuality = args[++i] || 'original';
    } else if (arg === '--img-mode') {
      options.imgMode = args[++i] || 'local';
    } else if (arg === '--proxy') {
      options.proxy = args[++i];
    } else if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    } else if (arg.startsWith('http')) {
      options.urls.push(arg);
    }
  }

  // --proxy 隐含 --img-mode proxy
  if (options.proxy && options.imgMode === 'local') {
    options.imgMode = 'proxy';
  }

  return options;
}

function printHelp() {
  console.log(`
wx2md - 微信公众号文章转 Markdown 工具

Usage:
  npx wx2md <url>                          # 单篇文章（默认下载原图）
  npx wx2md --file urls.txt                # 批量（一行一个 URL）
  npx wx2md -o ~/articles <url>            # 指定输出目录
  npx wx2md --img compressed <url>         # 下载压缩图（640px）
  npx wx2md --proxy https://proxy.example.com <url>  # 图片走代理（不下载本地）

Options:
  -f, --file <path>                从文件读取 URL 列表
  -o, --output <dir>               输出目录（默认 ./output）
  -i, --img <original|compressed>  图片质量（默认 original 原图）
      --img-mode <local|proxy>     图片模式（默认 local 本地下载）
      --proxy <url>                图片代理地址（设置后自动启用 proxy 模式）
  -h, --help                       显示帮助信息
  `);
}

// ─── 核心逻辑 ────────────────────────────────────────────

async function fetchArticleHtml(url) {
  const resp = await fetch(url, { headers: REQUEST_HEADERS });
  if (!resp.ok) {
    throw new Error('HTTP ' + resp.status + ': ' + resp.statusText);
  }
  return resp.text();
}

function checkWxError(rawHtml) {
  const retMatch = rawHtml.match(/var ret = '(-?\d+)'/);
  if (retMatch) {
    const ret = parseInt(retMatch[1], 10);
    if (ret === -2) {
      throw new Error('文章链接无效或已过期（ret=-2），请检查 URL 是否正确');
    }
    if (ret !== 0) {
      throw new Error('微信返回错误（ret=' + ret + '），文章可能不可访问');
    }
  }
}

function htmlDecode(url) {
  return url.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"');
}

// 将微信图片 URL 中的尺寸参数替换为目标质量
// original: /640 → /0（原图）
// compressed: 保持 /640（压缩图）
function adjustImageUrl(url, quality) {
  if (quality === 'original') {
    return url.replace(/\/\d+([?/])/g, '/0$1');
  }
  return url;
}

function parseArticle(rawHtml, imgQuality) {
  checkWxError(rawHtml);

  const $ = cheerio.load(rawHtml);

  const title =
    $('#activity-name').text().trim() ||
    $('h1.rich_media_title').text().trim() ||
    $('meta[property="og:title"]').attr('content') ||
    '未命名文章';

  const author =
    $('#js_name').text().trim() ||
    $('.rich_media_meta_nickname .rich_media_meta_text').text().trim() ||
    '';

  const publishTime =
    $('#publish_time').text().trim() ||
    $('em#publish_time').text().trim() ||
    '';

  const $content = $('#js_content');
  if ($content.length === 0) {
    throw new Error('无法提取文章内容，可能是非公开文章或页面结构已变更');
  }

  $content.find('script, style').remove();
  $content.find('#js_top_ad_area, #js_pc_qr_code, #content_bottom_area, #js_tags_preview_toast').remove();
  $content.find('.mp_profile_card_iframe_wrp').remove();
  // 移除底部推广区域（二维码、关注引导等）
  $content.find('#js_sponsor_ad_area, #js_tags_area, .rich_media_tool, .qr_code_pc').remove();
  $content.find('#js_pc_read_btn_area, #js_header_author_name_area').remove();
  $content.find('.js_pc_qr_code, #js_pc_qr_code_guide').remove();

  let contentHtml = $content.html() || '';

  // HTML 预处理：移除图片周围的 strong/b 标签，避免 Turndown 生成 **![img]**
  contentHtml = contentHtml.replace(/<(strong|b)>\s*(<img[^>]*>)\s*<\/(strong|b)>/gi, '$2');

  // 用正则提取图片 URL（从 data-src，HTML 中的原始值含 &amp;）
  const imgUrlRegex = /data-src="([^"]*mmbiz[^"]*)"/gi;
  const htmlImages = []; // HTML 中的原始 URL（含 &amp;）
  const rawImages = []; // 解码后的原始 URL（未调整尺寸，用于 Markdown 替换匹配）
  const realImages = []; // 调整尺寸后的 URL（用于下载）
  let match;
  while ((match = imgUrlRegex.exec(contentHtml)) !== null) {
    const htmlUrl = match[1];
    const rawUrl = htmlDecode(htmlUrl);
    const realUrl = adjustImageUrl(rawUrl, imgQuality);
    if (!rawImages.includes(rawUrl)) {
      htmlImages.push(htmlUrl);
      rawImages.push(rawUrl);
      realImages.push(realUrl);
    }
  }

  // 关键：用正则将 data-src 替换为 src，让 Turndown 能识别图片
  // 微信文章的 img 标签只有 data-src 没有 src，必须转换
  contentHtml = contentHtml.replace(/data-src="/g, 'src="');

  return { title, author, publishTime, contentHtml, htmlImages, rawImages, realImages };
}

function sanitizeFilename(name) {
  return name
    .replace(/[^\u4e00-\u9fa5a-zA-Z0-9()（）\s._-]/g, '_')
    .replace(/_+/g, '_')
    .trim()
    .slice(0, 100) || 'untitled';
}

function getImageExtension(url) {
  try {
    const fmtMatch = url.match(/[?&]wx_fmt=(\w+)/);
    if (fmtMatch) return '.' + fmtMatch[1];
    const pathname = new URL(url).pathname;
    const ext = extname(pathname).split('?')[0];
    if (['.webp', '.jpg', '.jpeg', '.png', '.gif', '.bmp', '.svg'].includes(ext.toLowerCase())) {
      return ext.toLowerCase();
    }
  } catch {}
  return '.jpg';
}

async function downloadImage(url, destPath, retries = 2) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const resp = await fetch(url, { headers: REQUEST_HEADERS });
      if (!resp.ok) throw new Error('HTTP ' + resp.status);
      const buffer = Buffer.from(await resp.arrayBuffer());
      writeFileSync(destPath, buffer);
      return true;
    } catch (err) {
      if (attempt === retries) {
        console.error('  [WARN] 图片下载失败: ' + url.slice(0, 80) + '... - ' + err.message);
        return false;
      }
      await new Promise(function (r) { setTimeout(r, 1000 * (attempt + 1)); });
    }
  }
}

async function downloadImages(realUrls, assetsDir) {
  mkdirSync(assetsDir, { recursive: true });

  const urlMap = new Map(); // realUrl → localPath
  const concurrency = 3;

  for (let i = 0; i < realUrls.length; i += concurrency) {
    const batch = realUrls.slice(i, i + concurrency);
    const tasks = batch.map(async function (url, batchIdx) {
      const idx = i + batchIdx;
      const ext = getImageExtension(url);
      const filename = String(idx + 1).padStart(3, '0') + ext;
      const localPath = join('assets', filename);
      const fullPath = join(assetsDir, filename);

      const ok = await downloadImage(url, fullPath);
      if (ok) {
        urlMap.set(url, localPath);
      }
    });
    await Promise.all(tasks);
  }

  return urlMap;
}

function htmlToMarkdown(html, title, author, publishTime, sourceUrl) {
  const turndown = new TurndownService({
    headingStyle: 'atx',
    codeBlockStyle: 'fenced',
    bulletListMarker: '-',
  });

  let bodyMd = turndown.turndown(html);

  // 修复转义的下划线（alt 文本中常见）
  bodyMd = bodyMd.replace(/\\_/g, '_');
  // 去除图片被 ** 包裹的情况（如 **![alt](url)**）
  bodyMd = bodyMd.replace(/\*\*(\s*!\[[^\]]*\]\([^)]*\)\s*)\*\*/g, '$1');

  // 清理多余空行（3个以上连续换行压缩为2个）
  bodyMd = bodyMd.replace(/\n{3,}/g, '\n\n');
  // 清理行尾空白
  bodyMd = bodyMd.replace(/[ \t]+$/gm, '');
  // 清理只含空白的行
  bodyMd = bodyMd.replace(/^\s*\n/gm, '\n');

  const escapedTitle = title.replace(/"/g, '\\"');
  const fm = ['---', 'title: "' + escapedTitle + '"'];
  if (author) fm.push('author: "' + author + '"');
  if (publishTime) fm.push('date: "' + publishTime + '"');
  fm.push('source: "' + sourceUrl + '"');
  fm.push('---');

  return fm.join('\n') + '\n\n' + bodyMd.trim() + '\n';
}

// ─── 单篇文章处理 ─────────────────────────────────────────

async function processArticle(url, outputDir, imgQuality, imgMode, proxyUrl) {
  console.log('\n📄 处理: ' + url);

  const rawHtml = await fetchArticleHtml(url);
  const { title, author, publishTime, contentHtml, htmlImages, rawImages, realImages } = parseArticle(rawHtml, imgQuality);

  console.log('   标题: ' + title);
  console.log('   作者: ' + (author || '未知'));
  console.log('   图片: ' + realImages.length + ' 张');

  const dirName = sanitizeFilename(title);
  const articleDir = resolve(outputDir, dirName);

  // 转 Markdown（此时 img 的 src 已从 data-src 复制过来，Turndown 能识别）
  let markdown = htmlToMarkdown(contentHtml, title, author, publishTime, url);

  if (imgMode === 'proxy' && proxyUrl) {
    // 代理模式：用代理 URL 替换图片链接，不下载到本地
    const proxyBase = proxyUrl.replace(/\/+$/, '');
    for (let i = 0; i < rawImages.length; i++) {
      const rawUrl = rawImages[i];
      const htmlUrl = htmlImages[i];
      const proxyImageUrl = proxyBase + '/?url=' + encodeURIComponent(rawUrl);

      // 替换 HTML 实体形式（含 &amp;）
      if (htmlUrl !== rawUrl) {
        const escaped1 = htmlUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        markdown = markdown.replace(new RegExp(escaped1, 'g'), proxyImageUrl);
      }
      // 替换已解码形式（Turndown 输出就是这种）
      const escaped2 = rawUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      markdown = markdown.replace(new RegExp(escaped2, 'g'), proxyImageUrl);
    }
    mkdirSync(articleDir, { recursive: true });
    console.log('   图片使用代理: ' + proxyBase);
  } else {
    // 本地模式：下载图片到 assets/
    const assetsDir = join(articleDir, 'assets');
    mkdirSync(assetsDir, { recursive: true });

    console.log('   下载图片中...');
    const urlMap = await downloadImages(realImages, assetsDir);
    console.log('   已下载 ' + urlMap.size + '/' + realImages.length + ' 张图片');

    for (let i = 0; i < rawImages.length; i++) {
      const rawUrl = rawImages[i];
      const htmlUrl = htmlImages[i];
      const realUrl = realImages[i];
      const localPath = urlMap.get(realUrl);
      if (!localPath) continue;

      // 替换 HTML 实体形式（含 &amp;）
      if (htmlUrl !== rawUrl) {
        const escaped1 = htmlUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        markdown = markdown.replace(new RegExp(escaped1, 'g'), localPath);
      }
      // 替换已解码形式（Turndown 输出）
      const escaped2 = rawUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      markdown = markdown.replace(new RegExp(escaped2, 'g'), localPath);
    }
  }

  const mdPath = join(articleDir, 'index.md');
  writeFileSync(mdPath, markdown, 'utf-8');

  console.log('   ✅ 已保存: ' + mdPath);
  return { title: title, success: true };
}

// ─── 主入口 ──────────────────────────────────────────────

async function main() {
  const options = parseArgs(process.argv.slice(2));

  const urls = [...options.urls];
  if (options.file) {
    const content = await readFile(options.file, 'utf-8');
    const fileUrls = content
      .split('\n')
      .map(function (l) { return l.trim(); })
      .filter(function (l) { return l.startsWith('http'); });
    urls.push(...fileUrls);
  }

  if (urls.length === 0) {
    console.error('错误: 未提供文章 URL。使用 --help 查看帮助。');
    process.exit(1);
  }

  console.log('共 ' + urls.length + ' 篇文章待处理，输出目录: ' + resolve(options.output));
  if (options.imgMode === 'proxy' && options.proxy) {
    console.log('图片代理: ' + options.proxy);
  }

  const results = [];
  for (const url of urls) {
    try {
      const result = await processArticle(url, options.output, options.imgQuality, options.imgMode, options.proxy);
      results.push(result);
    } catch (err) {
      console.error('   ❌ 失败: ' + err.message);
      results.push({ url: url, success: false, error: err.message });
    }
  }

  const success = results.filter(function (r) { return r.success; }).length;
  const failed = results.filter(function (r) { return !r.success; }).length;
  console.log('\n' + '─'.repeat(40));
  console.log('处理完成: ' + success + ' 成功, ' + failed + ' 失败');
}

main().catch(function (err) {
  console.error('致命错误:', err);
  process.exit(1);
});
