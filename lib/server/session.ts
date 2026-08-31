import { ensureDatabase } from '@/db/bootstrap';
import { getRawDb } from '@/db/index';

import { BusinessError } from './api';
import type { DemoSession, Role } from '../types';

const COOKIE_NAME = 'receivables_demo_session';
const ALLOWED_ROLES = new Set<Role>([
  'CITY_ADMIN',
  'DISTRICT_ADMIN',
  'DISTRICT_OPERATOR',
]);

interface SessionRow {
  id: string;
  role: Role;
  districtId: string | null;
  displayName: string;
  districtCode: string | null;
  districtName: string | null;
}

function parseCookie(request: Request): string | null {
  const cookieHeader = request.headers.get('cookie');
  if (!cookieHeader) return null;
  for (const item of cookieHeader.split(';')) {
    const [name, ...rest] = item.trim().split('=');
    if (name === COOKIE_NAME) {
      try {
        return decodeURIComponent(rest.join('='));
      } catch {
        return null;
      }
    }
  }
  return null;
}

function mapSession(row: SessionRow): DemoSession {
  return {
    id: row.id,
    role: row.role,
    districtId: row.districtId,
    districtCode: row.districtCode,
    districtName: row.districtName,
    displayName: row.displayName,
  };
}

async function findSession(id: string): Promise<DemoSession | null> {
  const row = await getRawDb()
    .prepare(
      `SELECT s.id, s.role, s.district_id AS districtId,
        s.display_name AS displayName, d.code AS districtCode,
        d.name AS districtName
      FROM demo_sessions s
      LEFT JOIN districts d ON d.id = s.district_id
      WHERE s.id = ?`,
    )
    .bind(id)
    .first<SessionRow>();
  return row ? mapSession(row) : null;
}

export function sessionCookie(id: string, request?: Request): string {
  const secure = request && new URL(request.url).protocol === 'https:';
  return `${COOKIE_NAME}=${encodeURIComponent(id)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=604800${secure ? '; Secure' : ''}`;
}

export async function getOrCreateSession(request: Request): Promise<{
  session: DemoSession;
  cookie: string | null;
}> {
  await ensureDatabase();
  const existingId = parseCookie(request);
  if (existingId) {
    const existing = await findSession(existingId);
    if (existing) return { session: existing, cookie: null };
  }

  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  await getRawDb()
    .prepare(
      `INSERT INTO demo_sessions (
        id, role, district_id, display_name, created_at, updated_at
      ) VALUES (?, 'CITY_ADMIN', NULL, '市级管理员', ?, ?)`,
    )
    .bind(id, now, now)
    .run();
  const session = await findSession(id);
  if (!session) throw new Error('SESSION_CREATE_FAILED');
  return { session, cookie: sessionCookie(id, request) };
}

export async function requireSession(request: Request): Promise<DemoSession> {
  await ensureDatabase();
  const id = parseCookie(request);
  if (!id) {
    throw new BusinessError(
      'SESSION_REQUIRED',
      '演示会话已失效，请刷新页面',
      401,
    );
  }
  const session = await findSession(id);
  if (!session) {
    throw new BusinessError(
      'SESSION_REQUIRED',
      '演示会话已失效，请刷新页面',
      401,
    );
  }
  return session;
}

export async function switchDemoSession(
  request: Request,
  role: Role,
  districtCode?: string | null,
): Promise<{ session: DemoSession; cookie: string }> {
  await ensureDatabase();
  if (!ALLOWED_ROLES.has(role)) {
    throw new BusinessError('INVALID_ROLE', '未知演示身份');
  }

  let district: { id: string; code: string; name: string } | null = null;
  if (role !== 'CITY_ADMIN') {
    district = await getRawDb()
      .prepare('SELECT id, code, name FROM districts WHERE code = ?')
      .bind(districtCode ?? 'BEILIN')
      .first<{ id: string; code: string; name: string }>();
    if (!district) {
      throw new BusinessError('DISTRICT_NOT_FOUND', '未找到所选区县');
    }
  }

  const currentId = parseCookie(request);
  const existing = currentId ? await findSession(currentId) : null;
  const id = existing?.id ?? crypto.randomUUID();
  const now = new Date().toISOString();
  const displayName =
    role === 'CITY_ADMIN'
      ? '市级管理员'
      : `${district?.name}${role === 'DISTRICT_ADMIN' ? '管理员' : '填报人'}`;

  await getRawDb()
    .prepare(
      `INSERT INTO demo_sessions (
        id, role, district_id, display_name, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        role = excluded.role,
        district_id = excluded.district_id,
        display_name = excluded.display_name,
        updated_at = excluded.updated_at`,
    )
    .bind(id, role, district?.id ?? null, displayName, now, now)
    .run();

  const session = await findSession(id);
  if (!session) throw new Error('SESSION_SWITCH_FAILED');
  return { session, cookie: sessionCookie(id, request) };
}
