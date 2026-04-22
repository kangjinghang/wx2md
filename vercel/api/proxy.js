export default async function handler(request) {
  // CORS preflight
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET',
        'Access-Control-Max-Age': '86400',
      },
    });
  }

  const url = new URL(request.url);
  const imageUrl = url.searchParams.get('url');

  if (!imageUrl) {
    return new Response('Usage: ?url=<wechat_image_url>', { status: 400 });
  }

  const allowedHosts = ['mmbiz.qpic.cn', 'mmbiz.qlogo.cn', 'mmecoa.qpic.cn'];
  let targetHost;
  try {
    targetHost = new URL(imageUrl).hostname;
  } catch {
    return new Response('Invalid URL', { status: 400 });
  }
  if (!allowedHosts.some((h) => targetHost === h || targetHost.endsWith('.' + h))) {
    return new Response('Domain not allowed', { status: 403 });
  }

  try {
    const resp = await fetch(imageUrl, {
      headers: {
        Referer: 'https://mp.weixin.qq.com/',
        'User-Agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/117.0.0.0 Safari/537.36',
      },
    });

    if (!resp.ok) {
      return new Response('Upstream error: ' + resp.status, { status: resp.status });
    }

    const contentType = resp.headers.get('Content-Type') || 'image/jpeg';

    return new Response(resp.body, {
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=31536000',
        'Access-Control-Allow-Origin': '*',
      },
    });
  } catch (err) {
    return new Response('Fetch error: ' + err.message, { status: 502 });
  }
}
