import { createServer, type IncomingMessage } from 'node:http';
import { BusinessError, routeError } from '../../../lib/server/api';

export const MAX_BODY_BYTES = 12 * 1024 * 1024;

export function readBody(
  request: IncomingMessage,
  limit: number,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let length = 0;
    const cleanup = () => {
      request.off('data', onData);
      request.off('end', onEnd);
      request.off('error', onError);
      request.off('aborted', onAborted);
    };
    const onError = (error: Error) => {
      cleanup();
      reject(error);
    };
    const onAborted = () =>
      onError(new BusinessError('REQUEST_ABORTED', '请求已中断', 400));
    const onEnd = () => {
      cleanup();
      resolve(Buffer.concat(chunks));
    };
    const onData = (chunk: Buffer) => {
      length += chunk.length;
      if (length > limit) {
        cleanup();
        request.resume();
        reject(
          new BusinessError(
            'FILE_TOO_LARGE',
            '请求内容过大，单个附件不能超过 10MB',
            413,
          ),
        );
      } else chunks.push(chunk);
    };
    if (Number(request.headers['content-length']) > limit) {
      request.resume();
      reject(
        new BusinessError(
          'FILE_TOO_LARGE',
          '请求内容过大，单个附件不能超过 10MB',
          413,
        ),
      );
      return;
    }
    request.on('data', onData);
    request.once('end', onEnd);
    request.once('error', onError);
    request.once('aborted', onAborted);
  });
}

export function createFetchServer(
  handler: (request: Request) => Promise<Response>,
  resolveOrigin: (request: IncomingMessage) => string,
) {
  let active = 0;
  const server = createServer(async (incoming, outgoing) => {
    if (++active > 24) {
      active--;
      incoming.resume();
      outgoing.writeHead(503, { 'Retry-After': '5' });
      outgoing.end('服务繁忙');
      return;
    }
    try {
      const origin = resolveOrigin(incoming);
      if (
        !incoming.url?.startsWith('/') ||
        incoming.url.startsWith('//') ||
        incoming.url.includes('\\')
      )
        throw new BusinessError('INVALID_URL', '无效请求路径', 400);
      const method = incoming.method || 'GET';
      const headers = new Headers();
      for (const [name, value] of Object.entries(incoming.headers)) {
        if (value !== undefined)
          headers.set(name, Array.isArray(value) ? value.join(', ') : value);
      }
      const body = ['GET', 'HEAD'].includes(method)
        ? undefined
        : await readBody(
            incoming,
            incoming.url.startsWith('/api/auth/') ? 16_384 : MAX_BODY_BYTES,
          );
      const request = new Request(new URL(incoming.url, origin), {
        method,
        headers,
        body: body ? new Uint8Array(body) : undefined,
      });
      const response = await handler(request);
      outgoing.statusCode = response.status;
      response.headers.forEach((value, name) =>
        outgoing.setHeader(name, value),
      );
      outgoing.end(
        method === 'HEAD'
          ? undefined
          : Buffer.from(await response.arrayBuffer()),
      );
    } catch (error) {
      const response = routeError(error);
      if (!outgoing.headersSent) {
        outgoing.statusCode = response.status;
        response.headers.forEach((value, name) =>
          outgoing.setHeader(name, value),
        );
        outgoing.end(Buffer.from(await response.arrayBuffer()));
      } else outgoing.end();
    } finally {
      active--;
    }
  });
  server.requestTimeout = 30_000;
  server.headersTimeout = 10_000;
  server.keepAliveTimeout = 5_000;
  server.maxHeadersCount = 64;
  return server;
}
