import { createHash, randomBytes } from 'node:crypto';
import { getRawDb } from '../../../db/adapters/node';
import { BusinessError, ok, routeError } from '../../../lib/server/api';
import { assertPassword, hashPassword, verifyPassword } from './passwords';
import { authContext, createSession, sessionCookie } from './session';

export function normalizedUsername(value: unknown): string {
  if (
    typeof value !== 'string' ||
    !/^[a-z0-9][a-z0-9._-]{2,63}$/i.test(value.trim())
  ) {
    throw new BusinessError(
      'INVALID_USERNAME',
      '账号需为 3–64 位字母、数字、点、下划线或短横线',
    );
  }
  return value.trim().toLowerCase();
}

let dummyHash: string;
export async function prepareLogin() {
  dummyHash = await hashPassword(randomBytes(32).toString('base64url'));
}

async function loginThrottle(username: string) {
  const db = getRawDb();
  const now = Date.now();
  const accountKey = createHash('sha256').update(username).digest('hex');
  const limits = [
    { key: 'global', max: 30, window: 60_000 },
    { key: accountKey, max: 5, window: 600_000 },
  ];
  for (const limit of limits) {
    const result = await db
      .prepare(`INSERT INTO auth_login_limits (key, attempts, resets_at)
      VALUES (?, 1, ?) ON CONFLICT(key) DO UPDATE SET
      attempts = CASE WHEN resets_at <= ? THEN 1 ELSE attempts + 1 END,
      resets_at = CASE WHEN resets_at <= ? THEN excluded.resets_at ELSE resets_at END
      RETURNING attempts`)
      .bind(limit.key, now + limit.window, now, now)
      .first<{ attempts: number }>();
    // Check the global budget BEFORE allocating an account key, keeping anonymous storage bounded.
    if (result && result.attempts > limit.max)
      throw new BusinessError(
        'LOGIN_RATE_LIMITED',
        '登录尝试过于频繁，请稍后再试',
        429,
      );
  }
  // A finite time window, including expired account keys, prevents unbounded unauthenticated storage growth.
  await db
    .prepare('DELETE FROM auth_login_limits WHERE resets_at < ?')
    .bind(now)
    .run();
}

export async function handleAuth(request: Request): Promise<Response> {
  try {
    const path = new URL(request.url).pathname;
    if (path === '/api/auth/session' && request.method === 'GET') {
      try {
        const { session, csrfToken } = await authContext(request);
        return ok({ session, csrfToken });
      } catch (error) {
        if (error instanceof BusinessError && error.status === 401)
          return ok({ session: null, csrfToken: null });
        throw error;
      }
    }
    if (path === '/api/auth/login' && request.method === 'POST') {
      const input = await objectInput(request);
      const username = normalizedUsername(input.username);
      await loginThrottle(username);
      const password =
        typeof input.password === 'string' && input.password.length <= 128
          ? input.password
          : '';
      const user = await getRawDb()
        .prepare(
          'SELECT id, password_hash AS passwordHash, enabled FROM auth_users WHERE username = ?',
        )
        .bind(username)
        .first<{ id: string; passwordHash: string; enabled: number }>();
      const matches = await verifyPassword(
        password,
        user?.passwordHash ?? dummyHash,
      );
      if (!user || !user.enabled || !matches)
        throw new BusinessError('INVALID_CREDENTIALS', '账号或密码不正确', 401);
      const result = await createSession(user.id, request);
      return ok(
        { session: result.session, csrfToken: result.csrfToken },
        { headers: { 'Set-Cookie': result.cookie } },
      );
    }
    if (path === '/api/auth/logout' && request.method === 'POST') {
      const { tokenHash } = await authContext(request);
      await getRawDb()
        .prepare('DELETE FROM auth_sessions WHERE token_hash = ?')
        .bind(tokenHash)
        .run();
      return ok(
        { signedOut: true },
        { headers: { 'Set-Cookie': sessionCookie('', request) } },
      );
    }
    if (path === '/api/auth/password' && request.method === 'POST') {
      const { session } = await authContext(request);
      const input = await objectInput(request);
      assertPassword(input.newPassword);
      if (
        typeof input.currentPassword !== 'string' ||
        input.currentPassword.length > 128
      )
        throw new BusinessError('INVALID_PASSWORD', '请输入当前密码');
      await loginThrottle(`password:${session.id}`);
      const user = await getRawDb()
        .prepare(
          'SELECT password_hash AS passwordHash FROM auth_users WHERE id = ?',
        )
        .bind(session.id)
        .first<{ passwordHash: string }>();
      if (
        !user ||
        !(await verifyPassword(input.currentPassword, user.passwordHash))
      )
        throw new BusinessError('INVALID_PASSWORD', '当前密码不正确', 400);
      if (input.currentPassword === input.newPassword)
        throw new BusinessError(
          'PASSWORD_UNCHANGED',
          '新密码不能与当前密码相同',
        );
      const hash = await hashPassword(input.newPassword);
      const now = new Date().toISOString();
      const db = getRawDb();
      await db.batch([
        db
          .prepare(
            'UPDATE auth_users SET password_hash = ?, must_change_password = 0, updated_at = ? WHERE id = ?',
          )
          .bind(hash, now, session.id),
        db
          .prepare('DELETE FROM auth_sessions WHERE user_id = ?')
          .bind(session.id),
        db
          .prepare(`INSERT INTO audit_logs (id, district_id, entity_type, entity_id, action,
          new_value, source, actor_role, actor_name, created_at) VALUES (?, ?, 'USER', ?, 'PASSWORD_CHANGED', ?, 'ACCOUNT', ?, ?, ?)`)
          .bind(
            crypto.randomUUID(),
            session.districtId,
            session.id,
            JSON.stringify({ sessionsRevoked: true }),
            session.role,
            session.displayName,
            now,
          ),
      ]);
      const result = await createSession(session.id, request);
      return ok(
        { session: result.session, csrfToken: result.csrfToken },
        { headers: { 'Set-Cookie': result.cookie } },
      );
    }
    throw new BusinessError('NOT_FOUND', '接口不存在', 404);
  } catch (error) {
    return routeError(error);
  }
}

async function objectInput(request: Request): Promise<Record<string, unknown>> {
  const input: unknown = await request.json();
  if (!input || typeof input !== 'object' || Array.isArray(input))
    throw new BusinessError('INVALID_JSON', '请求内容必须是 JSON 对象');
  return input as Record<string, unknown>;
}
