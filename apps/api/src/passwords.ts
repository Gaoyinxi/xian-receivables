import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { BusinessError } from '../../../lib/server/api';

const COST = { N: 131072, r: 8, p: 1, maxmem: 160 * 1024 * 1024 };
let activeHashes = 0;

function derive(password: string, salt: Buffer): Promise<Buffer> {
  // Each hash uses ~128 MiB. Reject excess work rather than growing an unbounded queue.
  if (activeHashes >= 2)
    return Promise.reject(
      new BusinessError('AUTH_BUSY', '登录服务繁忙，请稍后重试', 503),
    );
  activeHashes++;
  return new Promise((resolve, reject) => {
    scrypt(password, salt, 64, COST, (error, key) => {
      activeHashes--;
      if (error) reject(error);
      else resolve(key);
    });
  });
}

export function assertPassword(password: unknown): asserts password is string {
  if (
    typeof password !== 'string' ||
    password.length < 12 ||
    password.length > 128
  ) {
    throw new BusinessError(
      'WEAK_PASSWORD',
      '密码需为 12–128 个字符，请使用不重复的长密码',
    );
  }
}

export async function hashPassword(password: string): Promise<string> {
  assertPassword(password);
  const salt = randomBytes(16);
  const key = await derive(password, salt);
  return `scrypt-v1$${salt.toString('hex')}$${key.toString('hex')}`;
}

export async function verifyPassword(
  password: string,
  stored: string,
): Promise<boolean> {
  const parts = stored.split('$');
  if (
    parts.length !== 3 ||
    parts[0] !== 'scrypt-v1' ||
    !/^[a-f0-9]{32}$/.test(parts[1]) ||
    !/^[a-f0-9]{128}$/.test(parts[2])
  )
    return false;
  const actual = await derive(password, Buffer.from(parts[1], 'hex'));
  return timingSafeEqual(actual, Buffer.from(parts[2], 'hex'));
}
