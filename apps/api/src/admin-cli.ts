import { randomBytes, randomUUID } from 'node:crypto';
import { writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { ensureDatabase } from '../../../db/bootstrap';
import { getRawDb } from '../../../db/adapters/node';
import type { Role } from '../../../lib/types';
import { initializeAuthSchema } from './auth-schema';
import { normalizedUsername } from './auth';
import { hashPassword } from './passwords';
import { dataDirectory } from './config';

process.umask(0o077);
const [command = 'init', ...args] = process.argv.slice(2);
const option = (name: string) => {
  const index = args.indexOf(`--${name}`);
  return index < 0 ? undefined : args[index + 1];
};
const generated = args.includes('--generate');
await ensureDatabase();
await initializeAuthSchema();
const db = getRawDb();

try {
  if (command === 'list') {
    const users = await db
      .prepare(
        `SELECT username, display_name AS name, role, district_id AS district, enabled FROM auth_users ORDER BY username`,
      )
      .all();
    console.table(users.results);
  } else {
    const username = normalizedUsername(
      option('username') || (command === 'init' ? 'admin' : ''),
    );
    const existing = await db
      .prepare(
        'SELECT id, role, district_id AS districtId, enabled FROM auth_users WHERE username = ?',
      )
      .bind(username)
      .first<{
        id: string;
        role: Role;
        districtId: string | null;
        enabled: number;
      }>();
    if (command === 'init' && existing) {
      console.log(
        '管理员已存在，未覆盖密码或任何业务数据。忘记密码可使用 reset-password 子命令。',
      );
    } else if (
      command === 'init' ||
      command === 'create' ||
      command === 'reset-password'
    ) {
      if (!generated)
        throw new Error(
          '请使用 --generate；系统会把随机初始密码写入仅本机本人可读的文件，不接收命令行明文密码。',
        );
      if (command === 'reset-password' && !existing)
        throw new Error('账号不存在');
      if (command !== 'reset-password' && existing)
        throw new Error('账号已存在，未覆盖');
      const role = (command === 'init' ? 'CITY_ADMIN' : option('role')) as Role;
      if (
        command !== 'reset-password' &&
        !['CITY_ADMIN', 'DISTRICT_ADMIN', 'DISTRICT_OPERATOR'].includes(role)
      )
        throw new Error('必须选择有效的三类角色之一');
      let districtId: string | null = null;
      if (command !== 'reset-password' && role !== 'CITY_ADMIN') {
        const district = await db
          .prepare('SELECT id FROM districts WHERE code = ?')
          .bind(option('district') || '')
          .first<{ id: string }>();
        if (!district)
          throw new Error(
            '区县角色必须指定 --district BEILIN / YANTA / LIANHU',
          );
        districtId = district.id;
      }
      const password = randomBytes(24).toString('base64url');
      const passwordHash = await hashPassword(password);
      const id = existing?.id ?? randomUUID();
      const now = new Date().toISOString();
      const name = (
        option('name') || (command === 'init' ? '系统管理员' : username)
      ).trim();
      if (!name || name.length > 80)
        throw new Error('显示名称应为 1–80 个字符');
      const update =
        command === 'reset-password'
          ? db
              .prepare(
                'UPDATE auth_users SET password_hash = ?, must_change_password = 1, updated_at = ? WHERE id = ?',
              )
              .bind(passwordHash, now, id)
          : db
              .prepare(`INSERT INTO auth_users (id, username, password_hash, display_name, role, district_id, enabled, must_change_password, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, 1, 1, ?, ?)`)
              .bind(
                id,
                username,
                passwordHash,
                name,
                role,
                districtId,
                now,
                now,
              );
      await db.batch([
        update,
        db.prepare('DELETE FROM auth_sessions WHERE user_id = ?').bind(id),
        db
          .prepare(`INSERT INTO audit_logs (id, district_id, entity_type, entity_id, action, new_value, source, actor_role, actor_name, created_at)
          VALUES (?, ?, 'USER', ?, ?, ?, 'LOCAL_CLI', 'CITY_ADMIN', '本机运维', ?)`)
          .bind(
            randomUUID(),
            existing?.districtId ?? districtId,
            id,
            command === 'reset-password' ? 'PASSWORD_RESET' : 'CREATE',
            JSON.stringify({ username, role: existing?.role ?? role }),
            now,
          ),
      ]);
      const dir = join(dataDirectory(), 'credentials');
      await mkdir(dir, { recursive: true, mode: 0o700 });
      const file = join(dir, `${username}-${Date.now()}.txt`);
      await writeFile(
        file,
        `项目应收管理系统 · 初始登录信息\n\n账号：${username}\n初始密码：${password}\n\n首次登录必须改密。请将密码保存到密码管理器后删除此文件。\n不要发到群聊或提交到代码仓库。\n`,
        { flag: 'wx', mode: 0o600 },
      );
      console.log(
        `账号已${existing ? '重置密码' : '创建'}：${username}\n初始登录信息（仅本人可读）：${file}\n未输出密码；首次登录须更改。`,
      );
    } else if (
      command === 'disable' ||
      command === 'enable' ||
      command === 'set-role'
    ) {
      if (!existing) throw new Error('账号不存在');
      const role = (
        command === 'set-role' ? option('role') : existing.role
      ) as Role;
      if (!['CITY_ADMIN', 'DISTRICT_ADMIN', 'DISTRICT_OPERATOR'].includes(role))
        throw new Error('角色无效');
      let districtId = existing.districtId;
      if (command === 'set-role') {
        const district =
          role === 'CITY_ADMIN'
            ? null
            : await db
                .prepare('SELECT id FROM districts WHERE code = ?')
                .bind(option('district') || '')
                .first<{ id: string }>();
        if (role !== 'CITY_ADMIN' && !district)
          throw new Error('必须指定有效区县');
        districtId = district?.id ?? null;
      }
      const enabled =
        command === 'disable' ? 0 : command === 'enable' ? 1 : existing.enabled;
      const now = new Date().toISOString();
      const results = await db.batch([
        db
          .prepare(`UPDATE auth_users SET role = ?, district_id = ?, enabled = ?, updated_at = ? WHERE id = ?
          AND (role != 'CITY_ADMIN' OR enabled = 0 OR (? = 'CITY_ADMIN' AND ? = 1)
          OR (SELECT COUNT(*) FROM auth_users WHERE role = 'CITY_ADMIN' AND enabled = 1) > 1)`)
          .bind(role, districtId, enabled, now, existing.id, role, enabled),
        db
          .prepare(`INSERT INTO audit_logs (id, district_id, entity_type, entity_id, action, old_value, new_value, source, actor_role, actor_name, created_at)
          SELECT ?, ?, 'USER', ?, 'UPDATE', ?, ?, 'LOCAL_CLI', 'CITY_ADMIN', '本机运维', ? WHERE changes() = 1`)
          .bind(
            randomUUID(),
            districtId,
            existing.id,
            JSON.stringify(existing),
            JSON.stringify({ role, districtId, enabled }),
            now,
          ),
        db
          .prepare(
            'DELETE FROM auth_sessions WHERE user_id = ? AND changes() = 1',
          )
          .bind(existing.id),
      ]);
      if (!results[0].meta.changes)
        throw new Error('不能停用或降级最后一个有效市级管理员');
      console.log('账号已更新，原登录会话已撤销。');
    } else
      throw new Error(
        '支持：init / create / list / reset-password / disable / enable / set-role',
      );
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : '账号操作失败');
  process.exitCode = 1;
} finally {
  db.close();
}
