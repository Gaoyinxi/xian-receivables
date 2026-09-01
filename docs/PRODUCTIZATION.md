# 产品化重构交付记录

日期：2026-08-31。基于原项目增量重构，未重建数据库、未清理正式数据、未改变权限和财务规则。

后续状态：2026-09-01 已备份并完成本机正式进程切换，数据与附件核验一致；公网和 Docker 运行仍未完成。详见 [本机切换记录](CUTOVER_2026-09-01.md)。

最新状态：同日已获明确授权并恢复 Cloudflare 临时公网入口，HTTPS 与匿名访问保护校验通过；Docker、固定域名及手机端验收仍待完成。详见 [公网恢复记录](PUBLIC_ACCESS_2026-09-01.md)。

## 1. 改动页面

工作台、全局导航、项目检索、新建项目/付款节点/回款/更正/催缴面板、应收总览、回款流水、催缴查询、审计、导入、风险规则以及原生应用的登录/改密数据接入层。
项目工作台继续提供合同、付款节点、催收、回款、风险、附件与审计；既有 hash 深链接保持可用。

## 2. UI / UX

- 从社交信息流式单列改为经营摘要 + 紧凑待办；宽屏摘要横向排列，不把六项数字堆到侧栏。
- 保留工作台、项目、数据中心、系统管理四个一级入口；页头增加当前位置和数据范围。
- 新增项目查找，支持名称、项目编码、合同、客户、多关键词；只搜索服务端已授权的项目。Cmd/Ctrl+K 可打开，不覆盖正在操作的模态表单。
- 墨蓝 `#175c7d` 操作色、冷灰 `#f4f6f8` 工作区、白色业务面板、深灰蓝 `#1c2b38` 正文、语义风险色。标题采用本地 Avenir/PingFang，金额用等宽数字，不新增外部字体请求。
- 4px 间距体系；控件 8px、输入 10px、面板 12px、大浮层 16px；150/200/250ms 动效 Token。导航保留受控玻璃材质，业务数据与表单不透明。
- 1280px 以上紧凑多列，1024px 以下底部导航，768px 以下重排工具栏；保留安全区、键盘焦点、语义标签、低动态/高对比/减少透明度支持。
- 增加骨架加载、同步时间、离线提示、旧数据提示、重试、查询空态；不会把刷新失败误报成“没有项目”。导入部分成功后保留结果与错误下载。
- 全局查询页面按需加载；保留服务端真实核销，不做金额乐观更新，不自动重试财务 POST。

设计依据使用 frontend-design 与 frontend-ui-engineering：业务信息密度、组件组合与状态反馈优先，而不是替换成一套新组件库。未执行浏览器交互或截图验收，不宣称完整 WCAG/手机兼容认证。

## 3. 删除/合并的重复职责

- 主组件中的独立页面和六类操作表单移出；不是删除功能。
- `components/receivables-app.tsx` 从 3016 行收敛至 546 行，保留流程协调职责。
- 首次 bootstrap 和手动刷新合并为一个资源生命周期 Hook。
- 合同、回款、催缴统一附件上传服务与客户端类型/大小提示，服务端继续做最终校验。
- 各表单中的 URL、请求方法、JSON 序列化移入业务服务；格式化和展示标签归入 `lib/presentation.ts`。
- 旧加载响应不能覆盖新请求；切换身份清空旧授权快照并取消读取。迟到的旧 401 不会让新身份退出。

## 4. 共享组件与状态

复用既有 Button、Dialog、Sheet、Command、Table、Tabs、Skeleton、FormField、DataPanel。
新组合组件：ApplicationHeader、ProjectSwitcher、WorkspaceStatus、WorkspaceSkeleton、AttachmentField。
`useWorkspaceData` 唯一持有业务快照；`LatestRequest` 负责请求版本与取消；页面状态仍用 React，URL 保存视图/项目/节点。没有新增状态管理依赖。

## 5. 后端改造

项目新增、回款登记、回款更正三条链路完成：

```text
HTTP controller（会话、输入校验、响应）
  → service（区县/角色、业务检查、编排）
    → repository（参数化 SQL 与完整原子批次）
      → SqlDatabase port → SQLite 或 D1
```

原 SQL 条件、金额单位、写入顺序、成功标记、核销/归档/审计同事务均保留。`amountYuan` 经现有 Zod 转换后已经是分，仓储不得再次乘 100。
其余共享处理器继续沿用已验证实现，尚未全部迁入 services/repositories；下一轮按领域迁移，不声称全后端已完成分层。

原生 HTTP 层新增请求 ID、状态码、耗时的 JSON 日志，不记录请求体、Cookie、账户口令、金额或文件内容。`LOG_LEVEL=silent` 可关闭访问日志；原有异常日志仍需在接入集中日志前单独审查脱敏。监督进程停止期限调整为 12 秒，给子进程 10 秒优雅退出留出余量。

## 6. API 契约

新增 `/api/v1/`，旧 `/api/` 原样兼容。前端业务与认证服务使用 v1，不通过自动重试或双写回退到旧版本。

```json
{ "success": true, "data": {}, "error": null, "meta": { "apiVersion": "v1" } }
```

```json
{
  "success": false,
  "data": null,
  "error": { "code": "FORBIDDEN", "message": "无权操作" },
  "meta": { "apiVersion": "v1" }
}
```

字段错误、导入行错误位于 `error.fieldErrors` / `error.rowErrors`。HTTP 状态保持原有含义。成功附件下载仍是二进制，附件失败为 JSON；HEAD/204/304 不增加正文。

| 路径（前缀 `/api/v1`）                                           | 方法       | 说明                           |
| ---------------------------------------------------------------- | ---------- | ------------------------------ |
| `/bootstrap`                                                     | GET        | 当前权限范围内快照             |
| `/projects`                                                      | POST       | 市级新增项目                   |
| `/receivables`、`/receivables/confirm`                           | POST       | 节点新增 / 市级确认            |
| `/receipts`、`/receipts/correct`                                 | POST       | 回款 / 有原因更正              |
| `/collections`、`/collections/correct`                           | POST       | 催收 / 有原因更正              |
| `/attachments`、`/attachments/:id`                               | POST / GET | 受权上传 / 下载                |
| `/imports/preview`、`/imports/commit`                            | POST       | 逐行预览 / 有效行提交          |
| `/risk-rules`                                                    | PUT        | 市级规则变更                   |
| `/session`                                                       | POST       | 私有演示身份；正式环境拒绝     |
| `/auth/session`、`/auth/login`、`/auth/logout`、`/auth/password` | GET / POST | 仅正式原生运行时               |
| `/health`                                                        | GET        | 仅正式原生运行时，最小就绪信息 |

原生 HTTP 层在限额、CSRF、multipart、身份分发之前统一分类路径；不把 `/api/v10` 当作 v1。Sites 新增兼容 catch-all，依旧使用 Sites 原有身份机制，没有把演示会话开放到正式服务。
所有外部基础设施未必返回 JSON，客户端对非 JSON、网络中断也给出安全提示。

已知财务边界：当前没有覆盖所有写接口的持久化幂等键。读取设置 30 秒超时，写入不新增客户端倒计时中止，保留原请求生命周期。断网或基础设施超时后服务器可能已经完成写入；客户端不自动重试并提示先核对台账，但不能阻止用户再次手动提交造成重复记录。该提示不等于“恰好一次”保障；公网财务使用前应补齐服务端幂等记录与重放测试，而不是自动重试。

## 7. 数据在哪里

正在使用的本机正式库默认在 `.data/selfhost/receivables.sqlite`，附件 `.data/selfhost/files/`，备份 `.data/selfhost/backups/`。以启动时 `RECEIVABLES_DATA_DIR` 为准；保留整个目录，包括 SQLite WAL/SHM。
原 `.wrangler` D1/R2 模拟数据和私有 Sites 数据是另外两套独立环境；没有复制到正式库。浏览器不存业务数据源。
Docker 使用独立命名卷 `receivables-data`，不会自动读取/迁移当前 Mac 的正式库。账户初始化必须由管理员显式执行，不做演示播种。

## 8. PostgreSQL 路径

本轮不声称 PostgreSQL 已接通，也不能只改 DATABASE_URL：当前 Schema、触发器、占位符及事务实现是 SQLite/D1 方言。
下一轮需要实现 PG repository/adapter、参数占位与返回值映射、BIGINT 分与 JS 安全整数策略、数据库端等价防超额/作废保护，生成独立迁移；在新数据库导入快照并核对数量、金额、审计和附件哈希，再停写切换。保留原库与旧构建作为回退，不原地覆盖。

## 9. Auth 扩展

已有正式账号、登录、退出、会话、密码修改、CLI 密码重置、角色/区县分配及会话撤销；不启用公开注册。
自助注册、邮箱找回、OAuth/SSO 和刷新令牌暂不启用。扩展位置在 `apps/api/src/auth.ts` / `session.ts` 及 `services/auth.ts`；提供者身份必须绑定稳定本地用户 ID，并继续读取本地角色/区县。不得把外部 email 或浏览器角色字段直接当成权限。
当前采用服务端 Cookie 会话，无需为了接口形式添加长期浏览器 JWT。未来 OAuth 需要重做回调来源校验、账户关联与安全评审，不能添加假成功接口。

## 10. 部署准备与剩余事项

已增加 Dockerfile、多阶段构建、非 root 运行、Compose、只读根文件系统、最小权限、健康检查和持久卷。默认仅 `127.0.0.1:4173:4173` 映射到宿主机，API 永远监听容器内部 loopback；公开访问由宿主机 HTTPS 反向代理承担，并设置精确 PUBLIC_ORIGIN。
容器设计参考 [Docker 多阶段构建](https://docs.docker.com/build/building/multi-stage/) 与 [Compose 网络边界](https://docs.docker.com/compose/how-tos/networking/)。前后端仍独立构建；同一受监督容器是当前单机拓扑，不等同于必须一起开发。

新机器执行（不要与本机现有 4173 服务同时启动）：

```bash
docker compose build
docker compose run --rm --no-deps app node .selfhost-build/api/admin.mjs init --generate
docker compose up -d
docker compose logs --tail=100 app
```

初始密码只写进命名卷中的 credentials 文件，命令仅输出路径；使用管理员受控通道取用，不提交仓库。不需要把 GATEWAY_TOKEN 写进 env，它由监督进程启动时生成。停止使用 `docker compose stop`；不要使用 `down -v` 删除数据卷。

环境隔离通过 `.env.example` 和明确的启动环境：每个 development/staging/production 实例独立数据目录、端口、构建和精确域名。普通启动器可用 `node --env-file=.env scripts/selfhost.mjs`；不会静默加载不明 .env。容器 PUBLIC_ORIGIN 从 Compose 环境传入。

尚待完成：Docker 引擎启动后的镜像构建/容器持久化实测；当前正式进程的备份切换；稳定公网隧道或 HTTPS 反向代理/域名；异地备份、日志轮转、告警、负载测试与独立安全审查。Redis、CDN、S3 等没有实际需求前不安装。此前隧道的网络连接问题不是本轮代码已解决的问题。

本机 Docker 引擎目前未运行，只验证了 Compose 配置解析；Node 基础镜像使用版本标签而非不可变 digest，系统包也未固定版本。正式发版时需固定经过镜像扫描与运行验证的 digest，并建立安全更新节奏，当前不宣称构建完全可复现。

## 11. 当前目录

```text
apps/web/                     独立前端入口、登录
apps/api/src/                 原生认证、HTTP、账户/备份工具
apps/web-server/              同源网关
app/api/v1/                   Sites 版本化入口
components/receivables/
  application-header.tsx      位置与身份
  project-switcher.tsx        项目查找
  workspace-status.tsx        同步/离线/骨架
  views/                     全局查询与管理页面
  forms/                     六类业务操作 + 附件输入
  project-*.tsx              原项目生命周期能力
hooks/use-workspace-data.ts   权限范围内唯一业务快照
services/                    前端业务 API 与附件、认证
lib/api-client.ts            HTTP、CSRF、错误、取消
lib/api-contract.ts          共享 v1 类型与路径分类
lib/server/handlers/          兼容 HTTP 控制器
lib/server/services/          项目/回款业务编排
lib/server/repositories/      项目/回款 SQL 原子操作
lib/server/data.ts            既有授权查询与聚合
db/ + drizzle/               保持现有 Schema 和存储适配
tests/                       单元、集成、权限与重启验证
Dockerfile + compose.yaml     单机容器部署准备
.github/workflows/verify.yml  检查流水线，不自动部署
```

## 12. 后续优先级

1. 真机交互验收：登录、项目搜索、导入部分成功、键盘/手机面板、失败重试与权限切换。
2. 本机切换已完成；后续解决公网链路并采用稳定地址。
3. 审计和大规模台账服务端分页，渐进迁移剩余业务仓储，加入明确的财务请求幂等键。
4. 确定组织账户流程后接入 SSO/MFA；业务规模确有需求时迁移 PostgreSQL。

验证命令仍为 `pnpm run test:unit`、`pnpm run test:integration`、`pnpm run build`，另运行 typecheck、lint、test:node、test:selfhost。隔离自托管构建可以使用 `RECEIVABLES_BUILD_DIR=.selfhost-build/verification`，不要在运行服务时覆盖它正在使用的构建目录。

### 本轮验证记录

| 检查                                    | 结果                               |
| --------------------------------------- | ---------------------------------- |
| 单元测试                                | 36 项通过                          |
| D1/R2 隔离集成                          | 22 项通过，重启数量与附件哈希一致  |
| 原生 SQLite 隔离集成                    | 22 项通过，重启数量与附件哈希一致  |
| 正式认证/权限/备份恢复                  | 9 项通过，使用临时数据库及随机端口 |
| 类型检查、Lint、Git 差异检查            | 通过                               |
| Vinext 生产构建、隔离自托管构建         | 通过                               |
| 三条仓储链路的 SQL 对照                 | 所有 prepared SQL 与重构前一致     |
| Compose 配置解析                        | 通过；未运行容器                   |
| 浏览器/手机交互、公网发布、正式进程切换 | 未执行                             |

测试没有访问或修改当前正式业务数据。GitHub 检查流水线已写入，但尚未推送执行。

Route: Luna -> Sol -> Luna。触发原因：v1 跨认证/上传/网关边界、财务分层与容器网络安全。Sol 仅提供脱敏方案，执行端完成实现与隔离测试。
