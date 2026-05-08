#!/usr/bin/env node

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

// ─── Args ────────────────────────────────────────────────

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

  if (options.proxy && options.imgMode === 'local') {
    options.imgMode = 'proxy';
  }

  return options;
}

function printHelp() {
  console.log(`
wx2md - Convert WeChat Official Account articles to Markdown.

Usage:
  node scripts/wx2md.mjs <url>
  node scripts/wx2md.mjs --file urls.txt
  node scripts/wx2md.mjs -o ~/articles <url>
  node scripts/wx2md.mjs --img compressed <url>
  node scripts/wx2md.mjs --proxy https://proxy.example.com <url>

Options:
  -f, --file <path>                Read URL list from file (one per line)
  -o, --output <dir>               Output directory (default ./output)
  -i, --img <original|compressed>  Image quality (default original)
      --img-mode <local|proxy>     Image mode (default local)
      --proxy <url>                Image proxy URL (enables proxy mode)
  -h, --help                       Show this help
`);
}

// ─── Core ────────────────────────────────────────────────

async function fetchArticleHtml(url) {
  const resp = await fetch(url, { headers: REQUEST_HEADERS });
  if (!resp.ok) {
    throw new Error('HTTP ' + resp.status + ': ' + resp.statusText);
  }
  return resp.text();
}

function checkWxError(rawHtml) {
  const $ = cheerio.load(rawHtml);

  const retMatch = rawHtml.match(/var ret = '(-?\d+)'/);
  if (retMatch) {
    const ret = parseInt(retMatch[1], 10);
    if (ret === -2) throw new Error('Article URL is invalid or expired');
    if (ret !== 0) throw new Error('WeChat error (ret=' + ret + '), article may be inaccessible');
  }

  const $weuiMsg = $('.weui-msg .weui-msg__title');
  if ($weuiMsg.length > 0) {
    const msg = $weuiMsg.text().trim();
    if (msg.includes('已被发布者删除')) throw new Error('Article has been deleted by the author');
    if (msg.includes('内容审核中')) throw new Error('Article is under review');
    if (msg) throw new Error('Article inaccessible: ' + msg);
  }

  if ($('#js_content').length === 0 && $('#js_article').length === 0) {
    throw new Error('Cannot extract article content — may be non-public or page structure changed');
  }
}

function htmlDecode(url) {
  return url.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"');
}

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
    'Untitled';

  const author =
    $('#js_name').text().trim() ||
    $('.rich_media_meta_nickname .rich_media_meta_text').text().trim() ||
    '';

  const publishTime =
    $('#publish_time').text().trim() ||
    $('em#publish_time').text().trim() ||
    '';

  const description = $('meta[property="og:description"]').attr('content') || '';
  const coverImage = $('meta[property="twitter:image"]').attr('content') || '';

  const $content = $('#js_content');

  $content.find('script, style').remove();
  $content.find('#js_top_ad_area, #js_pc_qr_code, #content_bottom_area, #js_tags_preview_toast').remove();
  $content.find('.mp_profile_card_iframe_wrp').remove();
  $content.find('#js_sponsor_ad_area, #js_tags_area, .rich_media_tool, .qr_code_pc').remove();
  $content.find('#js_pc_read_btn_area, #js_header_author_name_area').remove();
  $content.find('.js_pc_qr_code, #js_pc_qr_code_guide').remove();

  $content.find('iframe[class*="video_iframe"]').replaceWith('<p>[video]</p>');
  $content.find('mpvoice').replaceWith('<p>[audio]</p>');
  $content.find('qqmusic').replaceWith('<p>[music]</p>');
  $content.find('mp-weapp, mp-miniprogram').replaceWith('<p>[mini-program]</p>');
  $content.find('iframe[class*="vote_card"], iframe[class*="js_editor_vote_card"]').replaceWith('<p>[vote]</p>');
  $content.find('mpproduct, mpcps').replaceWith('<p>[product]</p>');
  $content.find('mpshop').replaceWith('<p>[shop]</p>');
  $content.find('mpgongyi').replaceWith('<p>[charity]</p>');
  $content.find('iframe[class*="card_iframe"][data-cardid]').replaceWith('<p>[card]</p>');

  $content.find('img[height]').removeAttr('height');

  $content.find('span, section, p').each((_, el) => {
    const style = $(el).attr('style') || '';
    if (/font-weight:\s*(bold|[6-9]00)/.test(style)) {
      const inner = $(el).html();
      $(el).replaceWith('<strong>' + inner + '</strong>');
    } else if (/font-style:\s*italic/.test(style)) {
      const inner = $(el).html();
      $(el).replaceWith('<em>' + inner + '</em>');
    }
  });

  let contentHtml = $content.html() || '';

  contentHtml = contentHtml.replace(/<(strong|b)>\s*(<img[^>]*>)\s*<\/(strong|b)>/gi, '$2');

  const imgUrlRegex = /data-src="([^"]*mmbiz[^"]*)"/gi;
  const htmlImages = [];
  const rawImages = [];
  const realImages = [];
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

  contentHtml = contentHtml.replace(/data-src="/g, 'src="');

  return { title, author, publishTime, description, coverImage, contentHtml, htmlImages, rawImages, realImages };
}

function sanitizeFilename(name) {
  return name
    .replace(/[^一-龥a-zA-Z0-9()（）\s._-]/g, '_')
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
        console.error('  [WARN] Image download failed: ' + url.slice(0, 80) + '... - ' + err.message);
        return false;
      }
      await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
    }
  }
}

async function downloadImages(realUrls, assetsDir) {
  mkdirSync(assetsDir, { recursive: true });

  const urlMap = new Map();
  const concurrency = 3;

  for (let i = 0; i < realUrls.length; i += concurrency) {
    const batch = realUrls.slice(i, i + concurrency);
    const tasks = batch.map(async (url, batchIdx) => {
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

function htmlToMarkdown(html, title, author, publishTime, sourceUrl, description, coverImage) {
  const turndown = new TurndownService({
    headingStyle: 'atx',
    codeBlockStyle: 'fenced',
    bulletListMarker: '-',
  });

  let bodyMd = turndown.turndown(html);

  bodyMd = bodyMd.replace(/\\_/g, '_');
  bodyMd = bodyMd.replace(/\*\*(\s*!\[[^\]]*\]\([^)]*\)\s*)\*\*/g, '$1');
  bodyMd = bodyMd.replace(/\n{3,}/g, '\n\n');
  bodyMd = bodyMd.replace(/[ \t]+$/gm, '');
  bodyMd = bodyMd.replace(/^\s*\n/gm, '\n');

  const escapedTitle = title.replace(/"/g, '\\"');
  const fm = ['---', 'title: "' + escapedTitle + '"'];
  if (author) fm.push('author: "' + author + '"');
  if (publishTime) fm.push('date: "' + publishTime + '"');
  if (description) fm.push('description: "' + description.replace(/"/g, '\\"') + '"');
  if (coverImage) fm.push('cover: "' + coverImage + '"');
  fm.push('source: "' + sourceUrl + '"');
  fm.push('---');

  return fm.join('\n') + '\n\n' + bodyMd.trim() + '\n';
}

// ─── Single article ──────────────────────────────────────

async function processArticle(url, outputDir, imgQuality, imgMode, proxyUrl) {
  console.log('\nProcessing: ' + url);

  const rawHtml = await fetchArticleHtml(url);
  const { title, author, publishTime, description, coverImage, contentHtml, htmlImages, rawImages, realImages } = parseArticle(rawHtml, imgQuality);

  console.log('   Title: ' + title);
  console.log('   Author: ' + (author || 'unknown'));
  console.log('   Images: ' + realImages.length);

  const fileName = sanitizeFilename(title) + '.md';

  let markdown = htmlToMarkdown(contentHtml, title, author, publishTime, url, description, coverImage);

  if (imgMode === 'proxy' && proxyUrl) {
    const proxyBase = proxyUrl.replace(/\/+$/, '');
    for (let i = 0; i < rawImages.length; i++) {
      const rawUrl = rawImages[i];
      const htmlUrl = htmlImages[i];
      const proxyImageUrl = proxyBase + '/?url=' + encodeURIComponent(rawUrl);

      if (htmlUrl !== rawUrl) {
        const escaped1 = htmlUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        markdown = markdown.replace(new RegExp(escaped1, 'g'), proxyImageUrl);
      }
      const escaped2 = rawUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      markdown = markdown.replace(new RegExp(escaped2, 'g'), proxyImageUrl);
    }
    mkdirSync(outputDir, { recursive: true });
    console.log('   Proxy: ' + proxyBase);
  } else {
    const assetsDir = join(outputDir, 'assets', sanitizeFilename(title));
    mkdirSync(assetsDir, { recursive: true });

    console.log('   Downloading images...');
    const urlMap = await downloadImages(realImages, assetsDir);
    console.log('   Downloaded ' + urlMap.size + '/' + realImages.length + ' images');

    for (let i = 0; i < rawImages.length; i++) {
      const rawUrl = rawImages[i];
      const htmlUrl = htmlImages[i];
      const realUrl = realImages[i];
      const localPath = urlMap.get(realUrl);
      if (!localPath) continue;

      const relPath = join('assets', sanitizeFilename(title), localPath.split('/').pop());

      if (htmlUrl !== rawUrl) {
        const escaped1 = htmlUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        markdown = markdown.replace(new RegExp(escaped1, 'g'), relPath);
      }
      const escaped2 = rawUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      markdown = markdown.replace(new RegExp(escaped2, 'g'), relPath);
    }
  }

  mkdirSync(outputDir, { recursive: true });
  const mdPath = join(outputDir, fileName);
  writeFileSync(mdPath, markdown, 'utf-8');

  console.log('   Saved: ' + mdPath);
  return { title, success: true, path: mdPath };
}

// ─── Main ────────────────────────────────────────────────

async function main() {
  const options = parseArgs(process.argv.slice(2));

  const urls = [...options.urls];
  if (options.file) {
    const content = await readFile(options.file, 'utf-8');
    const fileUrls = content
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.startsWith('http'));
    urls.push(...fileUrls);
  }

  if (urls.length === 0) {
    console.error('Error: No article URLs provided. Use --help for usage.');
    process.exit(1);
  }

  console.log('Processing ' + urls.length + ' article(s), output: ' + resolve(options.output));
  if (options.imgMode === 'proxy' && options.proxy) {
    console.log('Image proxy: ' + options.proxy);
  }

  const results = [];
  for (const url of urls) {
    try {
      const result = await processArticle(url, options.output, options.imgQuality, options.imgMode, options.proxy);
      results.push(result);
    } catch (err) {
      console.error('   Failed: ' + err.message);
      results.push({ url, success: false, error: err.message });
    }
  }

  const success = results.filter((r) => r.success).length;
  const failed = results.filter((r) => !r.success).length;
  console.log('\n' + '─'.repeat(40));
  console.log('Done: ' + success + ' succeeded, ' + failed + ' failed');

  if (failed > 0) process.exit(1);
}

main();
