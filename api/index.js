/** Vercel Edge Function - Pixiv API 反代 */
const ENABLE_API_PROXY = true;
const ENABLE_IMAGE_PROXY = true;
const ENABLE_OAUTH_PROXY = true;
// 网页版 ajax（收藏集等 App API 没有的端点）：/web/ajax/collections/{id} -> www.pixiv.net/ajax/collections/{id}
const ENABLE_WEB_PROXY = true;
// s.pximg.net 静态资源（评论印章/表情等）：/static/common/images/... -> s.pximg.net/common/images/...
const ENABLE_STATIC_PROXY = true;

const PIXIV_API_HOST = 'app-api.pixiv.net';
const PIXIV_OAUTH_HOST = 'oauth.secure.pixiv.net';
const PIXIV_IMAGE_HOST = 'i.pximg.net';
const PIXIV_WEB_HOST = 'www.pixiv.net';
const PIXIV_STATIC_HOST = 's.pximg.net';

export const config = { runtime: 'edge' };

export default async function handler(req) {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': '*',
      },
    });
  }

  const url = new URL(req.url);
  let targetHost;
  let path = url.pathname;

  // 移除 /api 前缀
  path = path.replace(/^\/api/, '');

  if (ENABLE_OAUTH_PROXY && path.startsWith('/oauth/')) {
    // /oauth/token -> oauth.secure.pixiv.net/token
    targetHost = PIXIV_OAUTH_HOST;
    path = path.replace('/oauth', '');
  } else if (ENABLE_OAUTH_PROXY && path.startsWith('/auth/')) {
    // /auth/token -> oauth.secure.pixiv.net/auth/token（pixivpy 默认就是打 /auth/token）
    targetHost = PIXIV_OAUTH_HOST;
  } else if (ENABLE_IMAGE_PROXY && path.startsWith('/image/')) {
    targetHost = PIXIV_IMAGE_HOST;
    path = path.replace('/image', '');
  } else if (ENABLE_STATIC_PROXY && path.startsWith('/static/')) {
    // /static/common/images/stamp/generated-stamps/202_s.jpg -> s.pximg.net/common/images/...
    targetHost = PIXIV_STATIC_HOST;
    path = path.replace('/static', '');
  } else if (ENABLE_WEB_PROXY && path.startsWith('/web/')) {
    // /web/ajax/collections/xxx -> www.pixiv.net/ajax/collections/xxx
    targetHost = PIXIV_WEB_HOST;
    path = path.replace('/web', '');
  } else if (ENABLE_API_PROXY) {
    targetHost = PIXIV_API_HOST;
  } else {
    return new Response(JSON.stringify({ error: 'Service not enabled' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const targetUrl = `https://${targetHost}${path}${url.search}`;

  const headers = new Headers(req.headers);
  headers.set('Host', targetHost);

  // 浏览器/App 不能直接设置 Cookie（forbidden header），这里用 X-Pixiv-Cookie 转发，
  // 用于网页版 ajax（收藏集等需要登录态）。
  const customCookie = req.headers.get('x-pixiv-cookie');
  if (customCookie) {
    headers.set('Cookie', customCookie);
    headers.delete('x-pixiv-cookie');
  }

  if (targetHost === PIXIV_WEB_HOST || targetHost === PIXIV_STATIC_HOST) {
    // 网页版 ajax 需要浏览器 UA + www 的 Referer，App 头会被拒
    // 客户端可用 X-Pixiv-Referer 指定更精确的 Referer（评论等 ajax 会校验作品页）
    headers.set('Referer', req.headers.get('x-pixiv-referer') || 'https://www.pixiv.net/');
    headers.delete('x-pixiv-referer');
    headers.set(
      'User-Agent',
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
    );
    headers.delete('App-OS');
    headers.delete('App-OS-Version');
    headers.delete('App-Version');
  } else {
    headers.set('Referer', 'https://app-api.pixiv.net/');

    // 客户端可以指定 X-Pixiv-Client: android|ios 选择 App 身份。
    // 默认用 Android：pixiv 已对旧版 iOS App 关闭评论接口（/v1/illust/comments 直接 404）。
    const client = (req.headers.get('x-pixiv-client') || 'android').toLowerCase();
    headers.delete('x-pixiv-client');

    if (client === 'ios') {
      headers.set('User-Agent', 'PixivIOSApp/7.13.3 (iOS 14.6; iPhone13,2)');
      headers.set('App-OS', 'ios');
      headers.set('App-OS-Version', '14.6');
      headers.set('App-Version', '7.13.3');
    } else {
      headers.set('User-Agent', 'PixivAndroidApp/5.0.234 (Android 11; Pixel 5)');
      headers.set('App-OS', 'android');
      headers.set('App-OS-Version', '11');
      headers.set('App-Version', '5.0.234');
    }
  }

  const newRequest = new Request(targetUrl, {
    method: req.method,
    headers: headers,
    body: req.method !== 'GET' && req.method !== 'HEAD' ? req.body : null,
  });

  try {
    const response = await fetch(newRequest);
    const newResponse = new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
    });
    newResponse.headers.set('Access-Control-Allow-Origin', '*');
    return newResponse;
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 502,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
