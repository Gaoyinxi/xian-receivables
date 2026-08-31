import { readFile, stat, realpath } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { createFetchServer } from '../api/src/http';
import {
  allowedOrigins,
  portFromEnv,
  requireGatewayToken,
} from '../api/src/config';
import { BusinessError, routeError } from '../../lib/server/api';

const webRoot = await realpath(resolve('.selfhost-build/web'));
const origins = allowedOrigins();
const hosts = new Map(origins.map((origin) => [new URL(origin).host, origin]));
const token = requireGatewayToken();
const apiPort = portFromEnv('API_PORT', 4174);
const types: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.woff2': 'font/woff2',
};

const server = createFetchServer(
  async (request) => {
    let response: Response;
    try {
      const url = new URL(request.url);
      if (url.pathname.startsWith('/api/')) {
        // Forward an explicit allowlist. Public x-forwarded/oai/role/proxy headers are never trusted.
        const headers = new Headers({
          'x-receivables-gateway': token,
          'x-receivables-origin': url.origin,
        });
        for (const name of [
          'cookie',
          'content-type',
          'origin',
          'x-csrf-token',
          'sec-fetch-site',
          'accept',
        ]) {
          const value = request.headers.get(name);
          if (value) headers.set(name, value);
        }
        response = await fetch(
          `http://127.0.0.1:${apiPort}${url.pathname}${url.search}`,
          {
            method: request.method,
            headers,
            redirect: 'manual',
            signal: AbortSignal.timeout(30_000),
            body: ['GET', 'HEAD'].includes(request.method)
              ? undefined
              : await request.arrayBuffer(),
          },
        );
      } else {
        if (!['GET', 'HEAD'].includes(request.method))
          throw new BusinessError(
            'METHOD_NOT_ALLOWED',
            '不支持该请求方法',
            405,
          );
        const path = decodeURIComponent(url.pathname);
        const relative = path === '/' ? 'index.html' : path.slice(1);
        if (
          relative
            .split('/')
            .some(
              (segment) => segment.startsWith('.') || segment.includes('\\'),
            ) ||
          !types[extname(relative)]
        )
          throw new BusinessError('NOT_FOUND', '页面不存在', 404);
        let target: string;
        try {
          target = await realpath(resolve(webRoot, relative));
        } catch {
          throw new BusinessError('NOT_FOUND', '页面不存在', 404);
        }
        if (!target.startsWith(webRoot + sep) || !(await stat(target)).isFile())
          throw new BusinessError('NOT_FOUND', '页面不存在', 404);
        response = new Response(new Uint8Array(await readFile(target)), {
          headers: {
            'Content-Type': types[extname(target)],
            'Cache-Control': relative.startsWith('assets/')
              ? 'public, max-age=31536000, immutable'
              : 'no-store',
          },
        });
      }
    } catch (error) {
      response = routeError(
        error instanceof URIError
          ? new BusinessError('INVALID_URL', '无效请求路径', 400)
          : error,
      );
    }
    const headers = new Headers(response.headers);
    headers.set(
      'Content-Security-Policy',
      "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; object-src 'none'; base-uri 'none'; form-action 'self'",
    );
    headers.set('X-Content-Type-Options', 'nosniff');
    headers.set('X-Frame-Options', 'DENY');
    headers.set('Referrer-Policy', 'no-referrer');
    headers.set('X-Robots-Tag', 'noindex, nofollow');
    headers.set(
      'Permissions-Policy',
      'camera=(), microphone=(), geolocation=()',
    );
    if (new URL(request.url).protocol === 'https:')
      headers.set('Strict-Transport-Security', 'max-age=31536000');
    return new Response(response.body, { status: response.status, headers });
  },
  (incoming) => {
    const origin = hosts.get(incoming.headers.host || '');
    if (!origin)
      throw new BusinessError('HOST_REJECTED', '访问地址不被允许', 403);
    return origin;
  },
);
const port = portFromEnv('WEB_PORT', 4173);
server.listen(port, '127.0.0.1', () =>
  console.log(`Web ready: http://127.0.0.1:${port}`),
);
for (const signal of ['SIGTERM', 'SIGINT'] as const)
  process.once(signal, () => {
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(1), 10_000).unref();
  });
