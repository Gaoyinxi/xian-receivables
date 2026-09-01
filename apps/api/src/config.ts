import { existsSync, mkdirSync, lstatSync, realpathSync } from 'node:fs';
import { resolve } from 'node:path';

export function dataDirectory(): string {
  const path = resolve(process.env.RECEIVABLES_DATA_DIR || '.data/selfhost');
  if (!existsSync(path)) mkdirSync(path, { recursive: true, mode: 0o700 });
  if (!lstatSync(path).isDirectory() || lstatSync(path).isSymbolicLink()) {
    throw new Error('数据目录必须是本机真实目录，不支持符号链接');
  }
  return realpathSync(path);
}

export function portFromEnv(name: string, fallback: number): number {
  const value = Number(process.env[name] || fallback);
  if (!Number.isInteger(value) || value < 1 || value > 65535)
    throw new Error(`${name} 端口无效`);
  return value;
}

export function allowedOrigins(): string[] {
  const webPort = portFromEnv('WEB_PORT', 4173);
  const origins = [
    `http://127.0.0.1:${webPort}`,
    `http://localhost:${webPort}`,
  ];
  if (process.env.PUBLIC_ORIGIN) {
    const url = new URL(process.env.PUBLIC_ORIGIN);
    if (
      url.protocol !== 'https:' ||
      url.origin !== process.env.PUBLIC_ORIGIN ||
      url.username ||
      url.password
    ) {
      throw new Error(
        'PUBLIC_ORIGIN 必须是精确的 HTTPS 源地址，不含路径或凭据',
      );
    }
    origins.push(url.origin);
  }
  return origins;
}

export function requireGatewayToken(): string {
  const token = process.env.GATEWAY_TOKEN;
  if (!token || !/^[a-f0-9]{64}$/.test(token))
    throw new Error('必须通过自托管启动器运行（缺少内部网关密钥）');
  return token;
}

export function webBindHost(): '127.0.0.1' | '0.0.0.0' {
  const host = process.env.WEB_BIND_HOST || '127.0.0.1';
  if (host === '127.0.0.1') return host;
  if (host === '0.0.0.0' && process.env.CONTAINER_MODE === '1') return host;
  throw new Error(
    '网页网关默认仅监听本机；容器模式才允许 WEB_BIND_HOST=0.0.0.0',
  );
}
