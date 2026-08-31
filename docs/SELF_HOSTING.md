# 电脑自托管交付手册

本次保留全部业务流程，把运行方式拆成独立前端、API 和网页网关。数据库和附件在你的电脑，不依赖付费服务器。当前定位是有真实账号保护的公网试运行，不是高可用生产服务或完整安全认证。

## 架构与职责

```text
浏览器（电脑 / 手机）
  ↓ HTTPS，需账号登录
Cloudflare 临时隧道
  ↓ 本机 loopback
apps/web-server  网页网关 127.0.0.1:4173
  ├─ 仅提供 apps/web 构建后的静态文件
  └─ /api/* → apps/api 127.0.0.1:4174（内部密钥校验）
                 ├─ 真实账号、会话、CSRF、请求上限
                 ├─ lib/server/handlers + lib/server/* 业务服务
                 └─ db/adapters/node
                      ├─ SQLite：.data/selfhost/receivables.sqlite
                      └─ 附件：.data/selfhost/files/
```

| 路径 | 职责 |
| --- | --- |
| `apps/web` | 独立 React/Vite 应用、登录与改密入口；没有数据库密钥 |
| `apps/api/src` | Node API、密码会话、账号运维、备份恢复 |
| `apps/web-server` | 同源静态资源和 API 反向代理；不访问数据库 |
| `components` / `hooks` | 复用的业务界面、交互和基础组件 |
| `lib/domain.ts` / `lib/types.ts` / `lib/validation.ts` | 金额、风险、共享类型与业务校验 |
| `lib/server/handlers` / `lib/server` | 唯一一份业务接口与事务逻辑 |
| `db/adapters` | 按构建选择原生 SQLite/本机文件或 Sites D1/R2 |
| `db/schema.ts` / `drizzle` | 数据模型与版本化迁移 |
| `app` | 保留的私有 Sites 入口，接口仅转发共享业务处理器 |
| `tests` | 单元、接口、并发、权限、恢复验证 |

前后端独立构建：`npm run web:build`、`npm run api:build`。网关构建：`npm run gateway:build`。统一构建：`npm run selfhost:build`。输出分别在 `.selfhost-build/web`、`api`、`gateway`。

SQL 金额仍按分保存；创建、更正、汇总、归档、审计在同一个 `BEGIN IMMEDIATE` 事务中执行。异常整批回滚，没有把财务流程改成 JavaScript 先查后写。自托管用户 ID 稳定，不因登录会话轮换而改变导入归属。

## 启动与停止

在项目根目录操作。需要 Node.js ≥ 24.11.1；新机器先用 `pnpm install --frozen-lockfile` 安装已锁定依赖。当前电脑已安装，无需重装。

```bash
npm run selfhost:build
npm run selfhost:init
npm run selfhost:start
```

- 本机入口：`http://127.0.0.1:4173/`。
- 初始账号 `admin`，随机初始密码保存在 `.data/selfhost/credentials/` 中；命令只显示文件路径，不显示密码。
- 首次登录必须修改初始密码，改密前无法访问业务数据。
- 把密码保存到密码管理器后，可自行删除对应初始密码文件；数据库只保存慢哈希。
- `selfhost:init` 重复执行不会重置密码、清空台账或重新加入示例数据。
- `npm run selfhost:stop` 只停止当前项目进程，保留数据库、附件和备份。

公网访问：

```bash
npm run selfhost:stop
npm run selfhost:public
```

启动器先提供维护页面，获取隧道实际 HTTPS 域名后，才用精确域名启动受保护的应用。不接受任意来源或通配域名。当前地址记录在 `.selfhost/runtime.json`；隧道日志在 `.selfhost/tunnel.log`。外网请求由 Cloudflare 中转，只有本机网页网关被连接，数据库没有公网端口。

首次安装隧道程序：`npm run selfhost:tunnel-install`，需要已有 GitHub CLI 登录；程序仅保存到项目 `.tools`，校验官方 SHA-256。也可使用自行安装的官方程序，并通过 `CLOUDFLARED_BIN` 指定绝对路径。

临时隧道用于开发和试运行，可能更换地址，不保证在线时间；固定域名和长期运行应改用已管理的隧道及独立运维方案。[Cloudflare 官方说明](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/do-more-with-tunnels/trycloudflare/)

电脑应保持开机、联网并避免休眠。没有自动修改你的系统睡眠、开机启动或路由器配置。合盖、停机、退出运行进程或断网都会使外网暂时不可用。

## 正式账号管理

账号开通和权限分配只能在本机命令行进行，没有公开注册或提权接口。

```bash
npm run selfhost:users -- list
npm run selfhost:users -- create --username beilin-admin --name 碑林管理员 --role DISTRICT_ADMIN --district BEILIN --generate
npm run selfhost:users -- create --username beilin-user --name 碑林填报人 --role DISTRICT_OPERATOR --district BEILIN --generate
npm run selfhost:users -- reset-password --username beilin-user --generate
npm run selfhost:users -- disable --username beilin-user
npm run selfhost:users -- enable --username beilin-user
npm run selfhost:users -- set-role --username beilin-user --role DISTRICT_OPERATOR --district YANTA
```

区县代码：`BEILIN` / `YANTA` / `LIANHU`。市级账号使用 `CITY_ADMIN`，不指定区县。账号变更和密码变更撤销既有会话；不能停用或降级最后一个有效市级管理员。初始/重置密码均随机生成并要求首次改密。

会话绝对有效期 8 小时，空闲 30 分钟失效。公网 Cookie 使用 Secure、HttpOnly、SameSite=Strict 和 `__Host-` 前缀。数据库保存令牌摘要，不存明文会话令牌。密码使用随机盐和异步 scrypt，限制并行计算，并在计算前执行全局及账号级登录限速。[密码存储依据](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html)

每个写请求必须匹配准确 Origin；登录后还必须携带会话绑定的 CSRF Token，附件上传同样受限。服务器从当前用户记录读取角色与区县，忽略客户端自报身份。自托管构建不包含演示会话提供器。

## 数据、示例与备份

新正式库不包含示例项目、应收、回款、催缴或附件；区县和风险阈值属于基础配置，予以保留。原 `.wrangler/` 和原私有 Sites 数据未删除、未混入正式库；这是切换到独立空库，不是对旧账务记录做物理删除。

数据目录默认 `.data/selfhost`，可通过 `RECEIVABLES_DATA_DIR` 指定另一处专用本机目录。不要放到网盘、网络共享或自动同步目录。请保留整个目录及附件，不要只移动 SQLite 主文件。目录权限 0700，敏感文件 0600；运行数据、密码、备份和工具均已加入 Git 忽略规则。

备份前停止服务：

```bash
npm run selfhost:stop
npm run selfhost:backup
```

等待服务停止后执行备份；如果 API 仍在运行，备份会拒绝执行。输出目录包含一致性 SQLite 快照、该快照引用的附件、完整性检查和 SHA-256 清单。失败的备份不会删除原始数据。

恢复到**新的空目录**，不会覆盖原数据库：

```bash
npm run selfhost:restore -- /绝对路径/备份目录 /绝对路径/新的空目录
RECEIVABLES_DATA_DIR=/绝对路径/新的空目录 npm run selfhost:start
```

恢复会先核对数据库和全部附件摘要，完成后撤销旧会话。初始备份已经在本机创建。仍应定期把备份复制到另一块可靠存储介质，单机磁盘损坏不能靠同盘备份解决。

## 验证与边界

```bash
npm run selfhost:stop
npm run verify:selfhost
npm run verify
```

完整验证会重建产物，请先停止服务。若当前产物已完成构建、只需复查运行中的版本，可用 `npm run verify:selfhost -- --reuse-build`；该模式不替换现有构建，测试仍写入临时库。

前者检查自托管构建、类型、静态规则、单元/模板/适配器测试、原业务的原生 SQLite 回归、真实账号/网关/CSRF/备份恢复；后者保留原 Sites/D1 回归及构建。

测试使用独立临时目录，不向正式库写测试项目。财务竞争测试包含故意制造数据库错误来验证完整回滚，这类测试中的 500 日志是预期结果。Node 24.11.1 的内置 SQLite 会输出实验性模块提示；验收以测试与构建结果为准。

未宣称完成：50 人并发压测、外部渗透测试、企业 SSO、多因素认证、真实微信兼容、自动灾备/高可用、公网服务器合规或法律风险规则审定。正式业务规模扩大后，应迁移至专用服务器，并做独立安全评估。
