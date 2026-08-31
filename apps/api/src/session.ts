import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { getRawDb } from '../../../db/adapters/node';
import { BusinessError } from '../../../lib/server/api';
import type { DemoSession, Role } from '../../../lib/types';

export const SESSION_ABSOLUTE_MS = 8 * 60 * 60 * 1000;
export const SESSION_IDLE_MS = 30 * 60 * 1000;

interface UserRow {
  id: string;
  username: string;
  displayName: string;
  role: Role;
  districtId: string | null;
  districtCode: string | null;
  districtName: string | null;
  mustChangePassword: number;
  csrfToken: string;
  tokenHash: string;
}
export interface AuthContext {
  session: DemoSession;
  csrfToken: string;
  tokenHash: string;
}
const cache = new WeakMap<Request, Promise<AuthContext>>();
export const digestToken = (value: string) =>
  createHash('sha256').update(value).digest('hex');

function cookieName(request?: Request) {
  return request && new URL(request.url).protocol === 'https:'
    ? '__Host-receivables_session'
    : 'receivables_local_session';
}
function tokenFromRequest(request: Request): string | null {
  for (const part of (request.headers.get('cookie') || '').split(';')) {
    const [name, ...rest] = part.trim().split('=');
    if (name !== cookieName(request)) continue;
    const value = rest.join('=');
    return /^[A-Za-z0-9_-]{43}$/.test(value) ? value : null;
  }
  return null;
}
export function sessionCookie(token: string, request?: Request): string {
  const secure = request && new URL(request.url).protocol === 'https:';
  return `${cookieName(request)}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${token ? SESSION_ABSOLUTE_MS / 1000 : 0}${secure ? '; Secure' : ''}`;
}

export function authContext(request: Request): Promise<AuthContext> {
  const existing = cache.get(request);
  if (existing) return existing;
  const operation = (async () => {
    const token = tokenFromRequest(request);
    if (!token)
      throw new BusinessError('SESSION_REQUIRED', '请先登录或重新登录', 401);
    const now = new Date().toISOString();
    const row = await getRawDb()
      .prepare(`SELECT u.id, u.username, u.display_name AS displayName,
      u.role, u.district_id AS districtId, u.must_change_password AS mustChangePassword,
      d.code AS districtCode, d.name AS districtName, s.csrf_token AS csrfToken, s.token_hash AS tokenHash
      FROM auth_sessions s JOIN auth_users u ON u.id = s.user_id
      LEFT JOIN districts d ON d.id = u.district_id
      WHERE s.token_hash = ? AND u.enabled = 1 AND s.expires_at > ? AND s.last_seen_at > ?`)
      .bind(
        digestToken(token),
        now,
        new Date(Date.now() - SESSION_IDLE_MS).toISOString(),
      )
      .first<UserRow>();
    if (!row)
      throw new BusinessError(
        'SESSION_REQUIRED',
        '登录已过期或账号权限已变更，请重新登录',
        401,
      );
    await getRawDb()
      .prepare('UPDATE auth_sessions SET last_seen_at = ? WHERE token_hash = ?')
      .bind(now, row.tokenHash)
      .run();
    return {
      session: {
        id: row.id,
        role: row.role,
        districtId: row.districtId,
        districtCode: row.districtCode,
        districtName: row.districtName,
        displayName: row.displayName,
        username: row.username,
        authMode: 'PASSWORD' as const,
        mustChangePassword: Boolean(row.mustChangePassword),
      },
      csrfToken: row.csrfToken,
      tokenHash: row.tokenHash,
    };
  })();
  cache.set(request, operation);
  return operation;
}

export async function requireSession(request: Request): Promise<DemoSession> {
  const { session } = await authContext(request);
  if (session.mustChangePassword)
    throw new BusinessError(
      'PASSWORD_CHANGE_REQUIRED',
      '首次登录请先修改初始密码',
      403,
    );
  return session;
}
export async function getOrCreateSession(request: Request) {
  return { session: await requireSession(request), cookie: null };
}
export async function switchDemoSession(
  _request: Request,
  _role: Role,
  _district?: string | null,
): Promise<{ session: DemoSession; cookie: string }> {
  throw new BusinessError('DEMO_DISABLED', '正式环境禁止切换演示身份', 403);
}

export async function createSession(userId: string, request: Request) {
  const token = randomBytes(32).toString('base64url');
  const csrfToken = randomBytes(32).toString('base64url');
  const now = new Date().toISOString();
  await getRawDb().batch([
    getRawDb()
      .prepare(
        'DELETE FROM auth_sessions WHERE expires_at <= ? OR last_seen_at <= ?',
      )
      .bind(now, new Date(Date.now() - SESSION_IDLE_MS).toISOString()),
    getRawDb()
      .prepare(`INSERT INTO auth_sessions (token_hash, user_id, csrf_token, created_at, expires_at, last_seen_at)
      VALUES (?, ?, ?, ?, ?, ?)`)
      .bind(
        digestToken(token),
        userId,
        csrfToken,
        now,
        new Date(Date.now() + SESSION_ABSOLUTE_MS).toISOString(),
        now,
      ),
  ]);
  const authenticated = new Request(request.url, {
    headers: { Cookie: `${cookieName(request)}=${token}` },
  });
  const context = await authContext(authenticated);
  return {
    session: context.session,
    csrfToken,
    cookie: sessionCookie(token, request),
  };
}

export async function verifyCsrf(request: Request) {
  const { csrfToken } = await authContext(request);
  const provided = request.headers.get('x-csrf-token') || '';
  const expected = Buffer.from(csrfToken);
  const actual = Buffer.from(provided);
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
    throw new BusinessError(
      'CSRF_REJECTED',
      '请求校验失效，请刷新页面后重试',
      403,
    );
  }
}
