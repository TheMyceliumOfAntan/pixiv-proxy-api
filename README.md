# pixiv-proxy-api

Pixiv API / 图片 / OAuth / 网页版 ajax 反向代理，一键部署到 Vercel 或 Cloudflare Workers。

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/TheMyceliumOfAntan/pixiv-proxy-api&project-name=pixiv-proxy-api)
[![Deploy to Cloudflare Workers](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/TheMyceliumOfAntan/pixiv-proxy-api)

> 基于 [vmoranv/pixiv-proxy](https://github.com/vmoranv/pixiv-proxy) 修改，修复了上游不可用的 OAuth 路径等问题，并新增了网页版 / 静态资源反代。

---

## 这个项目是什么

pixiv 的 `app-api.pixiv.net`、`i.pximg.net`、`oauth.secure.pixiv.net`、`www.pixiv.net` 在部分网络环境（如中国大陆）无法直连。本项目是一个部署在境外的 Serverless 反向代理：

```text
你的程序 ──HTTPS──▶ 代理（Vercel / Cloudflare）──HTTPS──▶ pixiv 官方主机
```

客户端只需要把 base URL 从 `https://app-api.pixiv.net` 换成 `https://<你的域名>/api`，其余请求不变。

> 这是**反向代理**，不是 VPN / HTTP 正向代理。它只转发到固定的 pixiv 主机，不能让浏览器「通过它上网」。

---

## 特性

| 能力 | 说明 |
|---|---|
| **App API 反代** | `/api/*` → `app-api.pixiv.net/*`：排行榜、搜索、作品详情、收藏、关注等 |
| **图片反代** | `/api/image/*` 或 `/image/*` → `i.pximg.net/*`：原图、缩略图、头像 |
| **OAuth 反代** | `/api/auth/token` → `oauth.secure.pixiv.net/auth/token`：`refresh_token` / PKCE `authorization_code` 换 token |
| **网页版 ajax 反代** | `/api/web/*` 或 `/web/*` → `www.pixiv.net/*`：App API 没有的数据（收藏集、评论、SSR 页面等） |
| **静态资源反代** | `/api/static/*` 或 `/static/*` → `s.pximg.net/*`：评论印章、表情 |
| **CORS** | 所有路由带 `Access-Control-Allow-Origin: *`，并处理 `OPTIONS` 预检 |
| **Cookie 注入** | 请求头 `X-Pixiv-Cookie` 会被转成 `Cookie` 转发（浏览器禁止 JS 设置 `Cookie`） |
| **Referer 注入** | 请求头 `X-Pixiv-Referer` 指定来源页，部分网页版 ajax 会校验 |
| **App 身份切换** | 请求头 `X-Pixiv-Client: android` / `ios` 切换 UA 与 `App-*` 头 |

---

## 部署

### Vercel（推荐）

1. 点上面的 **Deploy with Vercel** 按钮，或 Fork 仓库后在 [vercel.com/new](https://vercel.com/new) 导入
2. 直接 **Deploy**（无需环境变量、无需构建）
3. 在项目 **Settings → Domains** 绑定自己的域名（按 Vercel 提示添加 CNAME 记录）

部署完成后，`https://<你的域名>/api/v1/illust/ranking?mode=day` 就是可用的接口地址。

> 直接用 `*.vercel.app` 可能被 Deployment Protection 拦截（返回登录页），生产环境建议绑定自定义域名。

### Cloudflare Workers

点 **Deploy to Cloudflare Workers** 按钮，或把 `cloudflare-worker-pixiv-proxy.js` 粘贴到 Worker 编辑器。

> 仓库里的 Worker 版本是**基础版**，只包含 API / 图片 / OAuth 反代，没有 `/web/`、`/static/`、`X-Pixiv-*` 等新增能力。需要完整功能请用 Vercel 版。
>
> pixiv 会拦截 `*.workers.dev`，Workers 方案必须绑定自定义域名。

---

## 路由表

| 请求路径 | 转发到 | 用途 |
|---|---|---|
| `/api/v1/...`、`/api/v2/...` | `app-api.pixiv.net/...` | App API |
| `/api/image/...`、`/image/...` | `i.pximg.net/...` | 图片 |
| `/api/static/...`、`/static/...` | `s.pximg.net/...` | 印章 / 表情 |
| `/api/web/...`、`/web/...` | `www.pixiv.net/...` | 网页版 ajax |
| `/api/auth/token` | `oauth.secure.pixiv.net/auth/token` | 换取 / 刷新 token |

API 路径需要带 `/api` 前缀；`/image/*`、`/static/*`、`/web/*` 两种写法都支持。

---

## 使用

### curl

```bash
BASE="https://your-proxy.example.com/api"

# App API
curl -H "Authorization: Bearer <ACCESS_TOKEN>" \
  "$BASE/v1/illust/detail?illust_id=12345678"

# 图片
curl -o out.jpg "$BASE/image/img-master/img/2024/01/01/00/00/00/12345678_p0_master1200.jpg"

# 网页版 ajax（需要登录态时注入 cookie）
curl -H "X-Pixiv-Cookie: PHPSESSID=xxxxx" \
  "$BASE/web/ajax/illust/12345678"
```

### Python（pixivpy3）

```python
from pixivpy3 import AppPixivAPI

api = AppPixivAPI()
api.hosts = "https://your-proxy.example.com/api"
api.auth(refresh_token="YOUR_REFRESH_TOKEN")

print(api.illust_ranking(mode="day").illusts[0].title)
```

> pixivpy 在 `hosts` 非官方地址时会强行加 `Host: app-api.pixiv.net`，Vercel 按 Host 路由会 404。
> 如果遇到 `404 DEPLOYMENT_NOT_FOUND`，继承 `AppPixivAPI` 并在 `requests_call` 里去掉 `host` 头即可（见 [#7](#与上游的差异)）。

### JavaScript

```js
const res = await fetch("https://your-proxy.example.com/api/v1/illust/ranking?mode=day", {
  headers: { Authorization: `Bearer ${accessToken}` },
});
const data = await res.json();
```

### C# / .NET

```csharp
var http = new HttpClient();
http.DefaultRequestHeaders.TryAddWithoutValidation("Authorization", $"Bearer {accessToken}");

var json = await http.GetStringAsync(
    "https://your-proxy.example.com/api/v1/illust/detail?illust_id=12345678");
```

图片：把 `https://i.pximg.net` 替换成 `https://your-proxy.example.com/api/image`。

---

## 配置

所有开关都是源文件顶部的常量，改完重新部署即可：

| 常量 | 默认 | 说明 |
|---|---|---|
| `ENABLE_API_PROXY` | `true` | App API 反代 |
| `ENABLE_IMAGE_PROXY` | `true` | 图片反代 |
| `ENABLE_OAUTH_PROXY` | `true` | OAuth 反代（上游默认关闭） |
| `ENABLE_WEB_PROXY` | `true` | 网页版 ajax 反代 |
| `ENABLE_STATIC_PROXY` | `true` | 静态资源反代 |

本地开发：

```bash
vercel dev      # Vercel
wrangler dev    # Cloudflare Workers
```

---

## 与上游的差异

| # | 改动 | 原因 |
|---|---|---|
| 1 | 修复 OAuth 路径映射 | 上游把 `/auth/token` 重写成 `/token`，直接 404 |
| 2 | 默认开启 OAuth 反代 | 实测经 Vercel 访问 `oauth.secure.pixiv.net` 不被 bot 拦截 |
| 3 | 新增 `/web/` 反代 | 收藏集、评论等数据只有网页版才有 |
| 4 | 新增 `/static/` 反代 | 评论印章 / 表情在 `s.pximg.net` |
| 5 | 新增 `X-Pixiv-Cookie` / `X-Pixiv-Referer` / `X-Pixiv-Client` | 浏览器无法设置 Cookie；网页版 ajax 校验 Referer；不同 App 身份数据不同 |
| 6 | `vercel.json` 增加 rewrite 与 CORS | 支持不带 `/api` 的路径，且浏览器可直接调用 |
| 7 | `OPTIONS` 预检处理 | 上游缺少预检响应，跨域请求会失败 |

---

## 已知限制

- **不能当梯子**：只转发到固定的 pixiv 主机，不能代理任意网站。
- **不能做网页登录**：pixiv 登录页在 `accounts.pixiv.net`，带域名绑定的 reCAPTCHA Enterprise 与 `domain=.pixiv.net` 的 Cookie，反向代理无法承载。需要网页会话时，请在自己能直连的环境登录，再用 `X-Pixiv-Cookie` 传入 `PHPSESSID`。
- **密码登录已不可用**：`grant_type=password` 返回 `1508 The grant type is unauthorized for this client_id`，只能用 `refresh_token` 或 PKCE 的 `authorization_code`。
- **评论接口**：App API 的评论端点已下线，改用网页版 `/web/ajax/street/comments/roots`（`limit` 上限 20）。

---

## 安全

这是一个开放的反向代理，任何知道域名的人都能用它转发 pixiv 请求。建议加一层 token 校验：

```js
// api/index.js 顶部
const PROXY_TOKEN = process.env.PROXY_TOKEN || '';

// handler 里，OPTIONS 分支之后
if (PROXY_TOKEN && req.headers.get('x-proxy-token') !== PROXY_TOKEN) {
  return new Response(JSON.stringify({ error: 'unauthorized' }), {
    status: 401,
    headers: { 'Content-Type': 'application/json' },
  });
}
```

- 不要把 `refresh_token`、`PHPSESSID` 提交到仓库
- 建议开启用量告警，图片反代流量较大
- 仅供学习与自用，请遵守 pixiv 服务条款

---

## License

[MIT](./LICENSE)

## 致谢

- [vmoranv/pixiv-proxy](https://github.com/vmoranv/pixiv-proxy)
- [upbit/pixivpy](https://github.com/upbit/pixivpy)
