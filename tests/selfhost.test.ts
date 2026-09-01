import assert from 'node:assert/strict';
import test from 'node:test';
import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:net';
import { request as httpRequest } from 'node:http';
import { randomBytes, createHash } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import type { BootstrapData, DemoSession } from '../lib/types';
import type { VersionedResponse } from '../lib/api-contract';
type V1Failure = Extract<VersionedResponse<never>, { success: false }>;

const exec = promisify(execFile);
const buildDirectory = process.env.RECEIVABLES_BUILD_DIR || '.selfhost-build';
// Node's fetch can replace Host. Use the HTTP transport when testing tunnel-origin headers,
// so the gateway sees the actual header bytes instead of a silently normalised test request.
async function wireRequest(
  url: string,
  init: RequestInit = {},
  rawPath?: string,
): Promise<Response> {
  const source = new Request(url, init);
  const body = ['GET', 'HEAD'].includes(source.method)
    ? undefined
    : Buffer.from(await source.arrayBuffer());
  return new Promise((resolve, reject) => {
    const request = httpRequest(
      url,
      {
        method: source.method,
        headers: Object.fromEntries(source.headers),
        ...(rawPath ? { path: rawPath } : {}),
      },
      (response) => {
        const parts: Buffer[] = [];
        response.on('data', (part) => parts.push(part));
        response.once('error', reject);
        response.once('end', () => {
          const headers = new Headers();
          for (const [name, value] of Object.entries(response.headers))
            if (value !== undefined)
              headers.set(
                name,
                Array.isArray(value) ? value.join(', ') : value,
              );
          resolve(
            new Response(Buffer.concat(parts), {
              status: response.statusCode,
              headers,
            }),
          );
        });
      },
    );
    request.once('error', reject);
    request.end(body);
  });
}
async function freePort() {
  const server = createServer();
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = (server.address() as { port: number }).port;
  await new Promise<void>((resolve) => server.close(() => resolve()));
  return port;
}
async function stop(child: ReturnType<typeof spawn>) {
  if (child.exitCode !== null) return;
  child.kill('SIGTERM');
  await new Promise<void>((resolve) => child.once('exit', () => resolve()));
}

void test(
  '正式自托管：认证、网关、权限、真实流程、备份与恢复',
  { timeout: 90_000 },
  async (t) => {
    const scratch = await mkdtemp(join(tmpdir(), 'receivables-selfhost-test-'));
    const directory = join(scratch, 'data');
    const [webPort, apiPort] = await Promise.all([freePort(), freePort()]);
    const base = `http://127.0.0.1:${webPort}`;
    const publicOrigin = 'https://selfhost-test.example';
    const env = {
      ...process.env,
      RECEIVABLES_DATA_DIR: directory,
      WEB_PORT: String(webPort),
      API_PORT: String(apiPort),
      GATEWAY_TOKEN: randomBytes(32).toString('hex'),
      PUBLIC_ORIGIN: publicOrigin,
    };
    const cli = (...args: string[]) =>
      exec(process.execPath, [join(buildDirectory, 'api/admin.mjs'), ...args], {
        env,
      });
    const backupCli = (...args: string[]) =>
      exec(
        process.execPath,
        [join(buildDirectory, 'api/backup.mjs'), ...args],
        {
          env,
        },
      );
    let api: ReturnType<typeof spawn> | undefined;
    let gateway: ReturnType<typeof spawn> | undefined;
    let logs = '';
    const launch = (entry: string) => {
      const child = spawn(
        process.execPath,
        [entry.replace('.selfhost-build', buildDirectory)],
        {
          env,
          stdio: ['ignore', 'pipe', 'pipe'],
        },
      );
      child.stdout?.on('data', (data) => {
        logs += String(data);
      });
      child.stderr?.on('data', (data) => {
        logs += String(data);
      });
      return child;
    };
    async function ready() {
      for (let attempt = 0; attempt < 100; attempt++) {
        if (api?.exitCode !== null || gateway?.exitCode !== null)
          throw new Error(`服务启动失败：${logs}`);
        try {
          if ((await fetch(`${base}/api/health`)).ok) return;
        } catch {
          /* starting */
        }
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
      throw new Error(`服务未就绪：${logs}`);
    }
    async function initialPassword(username: string) {
      const files = (await readdir(join(directory, 'credentials')))
        .filter((name) => name.startsWith(`${username}-`))
        .sort();
      const text = await readFile(
        join(directory, 'credentials', files.at(-1)!),
        'utf8',
      );
      return /初始密码：([^\n]+)/.exec(text)![1];
    }
    class Client {
      cookie = '';
      csrf = '';
      session: DemoSession | null = null;
      constructor(readonly publicHost = false) {}
      async raw(
        path: string,
        method = 'GET',
        body?: unknown,
        overrides: Record<string, string> = {},
      ) {
        const headers: Record<string, string> = {
          Origin: this.publicHost ? publicOrigin : base,
          Cookie: this.cookie,
          'X-CSRF-Token': this.csrf,
          ...overrides,
        };
        if (this.publicHost) headers.Host = new URL(publicOrigin).host;
        if (!(body instanceof FormData))
          headers['Content-Type'] = 'application/json';
        const response = await wireRequest(
          `${base}${path}`,
          {
            method,
            headers,
            body:
              body === undefined
                ? undefined
                : body instanceof FormData
                  ? body
                  : JSON.stringify(body),
          },
          path,
        );
        const cookie = response.headers.get('set-cookie');
        if (cookie) this.cookie = cookie.split(';')[0];
        return response;
      }
      async json<T = Record<string, unknown>>(
        path: string,
        method = 'GET',
        body?: unknown,
      ) {
        const response = await this.raw(path, method, body);
        const payload = (await response.json()) as {
          ok: boolean;
          data: T;
          code?: string;
          message?: string;
        };
        return { response, payload };
      }
      async ok<T = Record<string, unknown>>(
        path: string,
        method = 'GET',
        body?: unknown,
      ) {
        const { response, payload } = await this.json<T>(path, method, body);
        assert.equal(
          payload.ok,
          true,
          `${path}: ${response.status} ${payload.code} ${payload.message}`,
        );
        return payload.data;
      }
      async login(username: string, password: string) {
        const { response, payload } = await this.json<{
          session: DemoSession;
          csrfToken: string;
        }>('/api/auth/login', 'POST', { username, password });
        assert.equal(
          payload.ok,
          true,
          `login: ${response.status} ${payload.code}`,
        );
        this.csrf = payload.data.csrfToken;
        this.session = payload.data.session;
        return response;
      }
      async okV1<T = Record<string, unknown>>(
        path: string,
        method = 'GET',
        body?: unknown,
      ) {
        const response = await this.raw(`/api/v1/${path}`, method, body);
        const payload = (await response.json()) as VersionedResponse<T>;
        assert.equal(
          payload.success,
          true,
          `${path}: ${response.status} ${payload.error?.code}`,
        );
        assert.equal(payload.meta.apiVersion, 'v1');
        return payload.data as T;
      }
      async changePassword(currentPassword: string, newPassword: string) {
        const state = await this.ok<{
          session: DemoSession;
          csrfToken: string;
        }>('/api/auth/password', 'POST', { currentPassword, newPassword });
        this.csrf = state.csrfToken;
        this.session = state.session;
      }
      bootstrap() {
        return this.ok<BootstrapData>('/api/bootstrap');
      }
    }
    const password = randomBytes(24).toString('base64url');
    const owner = new Client(true),
      admin = new Client(),
      operator = new Client(),
      outsider = new Client();
    let attachmentId = '',
      projectId = '',
      receivableId = '',
      receiptId = '';
    const bytes = new TextEncoder().encode(
      '%PDF-1.4\nselfhost attachment test',
    );
    try {
      await cli('init', '--generate');
      for (const [username, role, district] of [
        ['district-admin', 'DISTRICT_ADMIN', 'BEILIN'],
        ['operator', 'DISTRICT_OPERATOR', 'BEILIN'],
        ['outsider', 'DISTRICT_OPERATOR', 'YANTA'],
      ]) {
        await cli(
          'create',
          '--username',
          username,
          '--role',
          role,
          '--district',
          district,
          '--generate',
        );
      }
      api = launch('.selfhost-build/api/server.mjs');
      gateway = launch('.selfhost-build/gateway/server.mjs');
      await ready();

      await t.test(
        '空白正式库、静态资源隔离和默认拒绝未登录业务访问',
        async () => {
          const sql = new DatabaseSync(join(directory, 'receivables.sqlite'), {
            readOnly: true,
          });
          for (const table of [
            'projects',
            'receivables',
            'receipts',
            'collection_events',
            'attachments',
          ])
            assert.equal(
              sql.prepare(`SELECT COUNT(*) n FROM ${table}`).get()!.n,
              0,
            );
          assert.equal(
            sql.prepare('SELECT COUNT(*) n FROM districts').get()!.n,
            3,
          );
          sql.close();
          const page = await fetch(base);
          assert.equal(page.status, 200);
          assert.match(
            page.headers.get('content-security-policy')!,
            /script-src 'self'/,
          );
          for (const path of [
            '/.env',
            '/.data/selfhost/receivables.sqlite',
            '/apps/api/src/main.ts',
            '/assets/../../.env',
            '/db/schema.ts',
          ])
            assert.equal((await fetch(`${base}${path}`)).status, 404);
          const anonymous = new Client();
          for (const path of ['/api/bootstrap', '/api/attachments/unknown'])
            assert.equal((await anonymous.raw(path)).status, 401);
          for (const path of [
            '/api/projects',
            '/api/receipts',
            '/api/receipts/correct',
            '/api/collections',
            '/api/imports/commit',
            '/api/session',
          ])
            assert.equal((await anonymous.raw(path, 'POST', {})).status, 401);
          assert.equal(
            (
              await fetch(`http://127.0.0.1:${apiPort}/api/bootstrap`, {
                headers: {
                  'x-role': 'CITY_ADMIN',
                  'x-receivables-origin': publicOrigin,
                },
              })
            ).status,
            403,
          );
          assert.equal(
            (
              await wireRequest(base, {
                headers: { Host: 'untrusted.example' },
              })
            ).status,
            403,
          );
        },
      );
      await t.test(
        '精确 Origin 校验、正式登录、Secure Cookie 和首次强制改密',
        async () => {
          const anonymous = new Client();
          for (const Origin of ['', 'null', 'https://evil.example'])
            assert.equal(
              (
                await anonymous.raw(
                  '/api/auth/login',
                  'POST',
                  { username: 'admin', password: 'not-the-password' },
                  { Origin },
                )
              ).status,
              403,
            );
          const response = await owner.login(
            'admin',
            await initialPassword('admin'),
          );
          assert.match(
            response.headers.get('set-cookie')!,
            /^__Host-receivables_session=/,
          );
          assert.match(response.headers.get('set-cookie')!, /Secure/);
          assert.match(response.headers.get('set-cookie')!, /HttpOnly/);
          assert.equal((await owner.raw('/api/bootstrap')).status, 403);
          await owner.changePassword(await initialPassword('admin'), password);
          assert.equal((await owner.bootstrap()).session.authMode, 'PASSWORD');
          for (const [username, client] of [
            ['district-admin', admin],
            ['operator', operator],
            ['outsider', outsider],
          ] as const) {
            const initial = await initialPassword(username);
            await client.login(username, initial);
            await client.changePassword(initial, password);
          }
        },
      );
      await t.test('CSRF、角色和区县隔离；不能重新启用演示身份', async () => {
        assert.equal(
          (await owner.raw('/api/session', 'POST', { role: 'CITY_ADMIN' }))
            .status,
          403,
        );
        assert.equal(
          (await owner.raw('/api/projects', 'POST', {}, { 'X-CSRF-Token': '' }))
            .status,
          403,
        );
        assert.equal(
          (
            await owner.raw(
              '/api/projects',
              'POST',
              {},
              { Origin: 'https://evil.example' },
            )
          ).status,
          403,
        );
        assert.equal(
          (await operator.raw('/api/projects', 'POST', {})).status,
          403,
        );
        assert.equal(
          (await operator.raw('/api/risk-rules', 'PUT', {})).status,
          403,
        );
        const project = await owner.ok<{ id: string }>(
          '/api/projects',
          'POST',
          {
            name: '正式权限测试',
            contractCode: `TEST-${crypto.randomUUID()}`,
            tags: [],
            districtCode: 'BEILIN',
            orgLevel4: '测试团队',
            customerName: '测试客户',
            customerType: '企业',
            customerContact: '测试联系人',
            deliveryOwner: '交付',
            accountManager: '客户经理',
            deliveryManager: '交付经理',
            status: '执行中',
            contractDate: '2026-01-01',
            contractAmountYuan: '1000.00',
            amountComposition: '标品',
          },
        );
        projectId = project.id;
        const node = await admin.ok<{ id: string }>(
          '/api/receivables',
          'POST',
          {
            projectId,
            sequenceNo: 1,
            paymentType: '进度款',
            amountYuan: '100.00',
            paymentCondition: '签约后付款',
            baselineEvent: 'SIGNING',
            baselineDate: '2026-01-01',
            termDays: 30,
          },
        );
        receivableId = node.id;
        assert.equal(
          (
            await operator.raw('/api/receivables/confirm', 'POST', {
              id: receivableId,
            })
          ).status,
          403,
        );
        assert.equal(
          (
            await outsider.raw('/api/receipts', 'POST', {
              receivableId,
              amountYuan: '10',
              receivedDate: '2026-08-31',
            })
          ).status,
          403,
        );
        await owner.ok('/api/receivables/confirm', 'POST', {
          id: receivableId,
        });
        assert.equal((await outsider.bootstrap()).projects.length, 0);
        const spoof = await outsider.raw('/api/bootstrap', 'GET', undefined, {
          'x-role': 'CITY_ADMIN',
          'x-district-id': 'dist-beilin',
          'oai-authenticated-user-id': 'fake',
        });
        assert.equal(
          ((await spoof.json()) as { data: BootstrapData }).data.projects
            .length,
          0,
        );
      });
      await t.test('正式凭据下多次回款、更正、授权附件与归档', async () => {
        receiptId = (
          await operator.okV1<{ id: string }>('receipts', 'POST', {
            receivableId,
            amountYuan: '50',
            receivedDate: '2026-08-31',
          })
        ).id;
        assert.equal(
          (
            await operator.raw('/api/receipts/correct', 'POST', {
              originalId: receiptId,
              receivableId,
              amountYuan: '30',
              receivedDate: '2026-08-31',
              reason: '测试更正',
            })
          ).status,
          403,
        );
        await admin.okV1('receipts/correct', 'POST', {
          originalId: receiptId,
          receivableId,
          amountYuan: '30',
          receivedDate: '2026-08-31',
          reason: '测试更正',
        });
        await operator.ok('/api/receipts', 'POST', {
          receivableId,
          amountYuan: '70',
          receivedDate: '2026-08-31',
        });
        assert.ok(
          (await owner.bootstrap()).projects.find(
            (project) => project.id === projectId,
          )!.archivedAt,
        );
        const form = new FormData();
        form.set('entityType', 'PROJECT');
        form.set('entityId', projectId);
        form.set(
          'file',
          new File([bytes], '验证.pdf', { type: 'application/pdf' }),
        );
        attachmentId = (
          await owner.ok<{ id: string }>('/api/attachments', 'POST', form)
        ).id;
        assert.deepEqual(
          new Uint8Array(
            await (
              await owner.raw(`/api/attachments/${attachmentId}`)
            ).arrayBuffer(),
          ),
          bytes,
        );
        assert.equal(
          (await outsider.raw(`/api/attachments/${attachmentId}`)).status,
          403,
        );
        assert.equal(
          (await new Client().raw(`/api/attachments/${attachmentId}`)).status,
          401,
        );
        const invalid = new FormData();
        invalid.set('entityType', 'PROJECT');
        invalid.set('entityId', projectId);
        invalid.set(
          'file',
          new File(['bad'], 'bad.pdf', { type: 'application/pdf' }),
        );
        assert.equal(
          (await owner.raw('/api/attachments', 'POST', invalid)).status,
          415,
        );
        assert.equal(
          (
            await owner.raw('/api/attachments', 'POST', form, {
              'X-CSRF-Token': '',
            })
          ).status,
          403,
        );
      });
      await t.test(
        'v1 在真实网关保留认证、上传、CSRF、限额和附件字节语义',
        async () => {
          const anonymous = new Client();
          const health = await anonymous.okV1('health');
          const ready = await anonymous.okV1('health/ready');
          const live = await anonymous.okV1('health/live');
          assert.equal(health.status, 'ready');
          assert.equal(ready.status, 'ready');
          assert.equal(live.status, 'live');
          assert.equal((await anonymous.okV1('auth/session')).session, null);
          const blocked = await anonymous.raw('/api/v1/bootstrap');
          assert.equal(blocked.status, 401);
          assert.equal(
            ((await blocked.json()) as V1Failure).error.code,
            'SESSION_REQUIRED',
          );
          for (const prefix of [
            '/api',
            '/api/v1',
            '/api/v1/x/..',
            '/api/v1/x/%2e%2e',
          ]) {
            const large = await anonymous.raw(`${prefix}/auth/login`, 'POST', {
              username: 'unknown',
              password: 'a'.repeat(17000),
            });
            assert.equal(large.status, 413);
            const body = (await large.json()) as {
              error?: { code: string };
              code?: string;
            };
            assert.equal(
              prefix === '/api' ? body.code : body.error?.code,
              'FILE_TOO_LARGE',
            );
          }
          const requestId = blocked.headers.get('x-request-id');
          assert.match(requestId!, /^[0-9a-f-]{36}$/);
          for (const headers of [
            { 'X-CSRF-Token': '' },
            { Origin: 'https://evil.example' },
          ] as Record<string, string>[]) {
            const denied = await owner.raw(
              '/api/v1/projects',
              'POST',
              {},
              headers,
            );
            assert.equal(denied.status, 403);
            assert.equal(((await denied.json()) as V1Failure).success, false);
          }
          const scoped = await outsider.okV1<BootstrapData>('bootstrap');
          assert.equal(scoped.projects.length, 0);
          const forbidden = await operator.raw(
            '/api/v1/receivables/confirm',
            'POST',
            { id: receivableId },
          );
          assert.equal(forbidden.status, 403);
          const overpaid = await operator.raw('/api/v1/receipts', 'POST', {
            receivableId,
            amountYuan: '1',
            receivedDate: '2026-08-31',
          });
          assert.equal(overpaid.status, 409);
          assert.equal(
            ((await overpaid.json()) as V1Failure).error.code,
            'OVERPAYMENT',
          );
          const downloaded = await owner.raw(
            `/api/v1/attachments/${attachmentId}`,
          );
          assert.equal(
            downloaded.headers.get('content-type'),
            'application/pdf',
          );
          assert.deepEqual(
            new Uint8Array(await downloaded.arrayBuffer()),
            bytes,
          );
          // Send raw dot segments on the wire; fetch/new URL alone normalize
          // them before transmission and would hide a response-wrapper bug.
          for (const segment of ['x/..', 'x/%2e%2e']) {
            const normalizedDownload = await owner.raw(
              `/api/v1/${segment}/attachments/${attachmentId}`,
            );
            assert.equal(normalizedDownload.status, 200);
            assert.equal(
              normalizedDownload.headers.get('content-type'),
              'application/pdf',
            );
            assert.deepEqual(
              new Uint8Array(await normalizedDownload.arrayBuffer()),
              bytes,
            );
          }
          const form = new FormData();
          form.set('entityType', 'PROJECT');
          form.set('entityId', projectId);
          form.set(
            'file',
            new File(['bad'], 'bad.pdf', { type: 'application/pdf' }),
          );
          const invalid = await owner.raw('/api/v1/attachments', 'POST', form);
          assert.equal(invalid.status, 415); // Passed multipart policy, rejected by file-signature validation.
          const client = new Client(true);
          const login = await client.raw('/api/v1/auth/login', 'POST', {
            username: 'admin',
            password,
          });
          const state = (await login.json()) as VersionedResponse<{
            csrfToken: string;
          }>;
          assert.equal(state.success, true);
          assert.match(login.headers.get('set-cookie')!, /Secure/);
          client.csrf = state.data.csrfToken;
          await client.okV1('auth/logout', 'POST', {});
          assert.equal((await client.raw('/api/bootstrap')).status, 401);
        },
      );
      await t.test(
        '稳定用户身份、会话哈希、退出/过期/权限变更即时失效',
        async () => {
          const another = new Client(true);
          await another.login('admin', password);
          assert.equal(another.session!.id, owner.session!.id);
          const sql = new DatabaseSync(join(directory, 'receivables.sqlite'));
          const bearer = owner.cookie.split('=')[1];
          assert.equal(
            sql
              .prepare(
                'SELECT COUNT(*) n FROM auth_sessions WHERE token_hash=?',
              )
              .get(bearer)!.n,
            0,
          );
          assert.equal(
            sql
              .prepare(
                'SELECT COUNT(*) n FROM auth_sessions WHERE token_hash=?',
              )
              .get(createHash('sha256').update(bearer).digest('hex'))!.n,
            1,
          );
          await another.ok('/api/auth/logout', 'POST', {});
          assert.equal((await another.raw('/api/bootstrap')).status, 401);
          await cli('disable', '--username', 'operator');
          assert.equal((await operator.raw('/api/bootstrap')).status, 401);
          await cli(
            'set-role',
            '--username',
            'district-admin',
            '--role',
            'DISTRICT_OPERATOR',
            '--district',
            'BEILIN',
          );
          assert.equal((await admin.raw('/api/bootstrap')).status, 401);
          sql
            .prepare(
              "UPDATE auth_sessions SET last_seen_at='2000-01-01T00:00:00.000Z' WHERE user_id=?",
            )
            .run(outsider.session!.id);
          assert.equal((await outsider.raw('/api/bootstrap')).status, 401);
          sql.close();
          await assert.rejects(cli('disable', '--username', 'admin'));
          assert.equal((await owner.raw('/api/bootstrap')).status, 200);
        },
      );
      await t.test('登录限速与密码计算并行上限', async () => {
        const requests = await Promise.all(
          [0, 1, 2, 3].map((index) =>
            new Client().raw('/api/auth/login', 'POST', {
              username: `unknown-${index}`,
              password: 'wrong-password',
            }),
          ),
        );
        assert.ok(requests.some((response) => response.status === 503));
        const client = new Client();
        for (let i = 0; i < 5; i++)
          assert.equal(
            (
              await client.raw('/api/auth/login', 'POST', {
                username: 'rate-test',
                password: 'incorrect',
              })
            ).status,
            401,
          );
        assert.equal(
          (
            await client.raw('/api/auth/login', 'POST', {
              username: 'rate-test',
              password: 'incorrect',
            })
          ).status,
          429,
        );
      });
      await t.test(
        '重启保留数据和附件；一致性备份能恢复到独立目录',
        async () => {
          await assert.rejects(backupCli('backup'));
          await stop(gateway!);
          await stop(api!);
          api = launch('.selfhost-build/api/server.mjs');
          gateway = launch('.selfhost-build/gateway/server.mjs');
          await ready();
          assert.equal((await owner.bootstrap()).receipts.length, 3);
          assert.deepEqual(
            new Uint8Array(
              await (
                await owner.raw(`/api/attachments/${attachmentId}`)
              ).arrayBuffer(),
            ),
            bytes,
          );
          await stop(gateway!);
          await stop(api!);
          const output = await backupCli('backup');
          const source = /备份完成：([^\n]+)/.exec(output.stdout)![1];
          const target = join(scratch, 'restored');
          await backupCli('restore', source, target);
          const restored = new DatabaseSync(
            join(target, 'receivables.sqlite'),
            { readOnly: true },
          );
          assert.equal(
            restored.prepare('SELECT COUNT(*) n FROM projects').get()!.n,
            1,
          );
          assert.equal(
            restored.prepare('SELECT COUNT(*) n FROM receipts').get()!.n,
            3,
          );
          assert.equal(
            restored.prepare('SELECT COUNT(*) n FROM auth_sessions').get()!.n,
            0,
          );
          restored.close();
          const manifest = JSON.parse(
            await readFile(join(source, 'manifest.json'), 'utf8'),
          );
          assert.equal(manifest.files.length, 1);
          assert.deepEqual(
            new Uint8Array(
              await readFile(join(target, 'files', manifest.files[0].name)),
            ),
            bytes,
          );
        },
      );
    } finally {
      if (gateway) await stop(gateway);
      if (api) await stop(api);
      await rm(scratch, { recursive: true, force: true });
    }
  },
);
