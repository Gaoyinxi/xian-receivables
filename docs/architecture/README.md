# 系统架构

本文是当前工程的架构入口。它描述已经存在的边界和下一阶段迁移方向，不要求为了目录整齐重写已工作的业务。

## Current Architecture

```text
Browser
  ↓ HTTPS / same origin
Web Gateway  apps/web-server
  ├─ static React app  apps/web
  └─ /api/* proxy + security headers
       ↓ loopback + per-start gateway token
Node API  apps/api
  ├─ auth/session/CSRF/RBAC
  ├─ /api legacy + /api/v1 compatibility
  └─ handlers → services → repositories
       ↓ SqlDatabase / file-storage ports
SQLite + local files  .data/selfhost (runtime, never Git)
```

私有 Sites 构建保留为另一套运行时：同一业务 Handler 通过 D1/R2 适配器运行，数据与本机 SQLite 不混用。业务主链仍是项目 → 应收 → 回款/催缴 → 风险/核销 → 审计。

## Problems

- `app/`（Sites）、`apps/`（自托管）和根级共享代码并存，若只看目录名容易误判职责。
- 项目、回款链路已进入 Service/Repository，其余 Handler 仍是渐进迁移状态。
- Drizzle SQL 已版本化，但启动仍执行手写 `CREATE TABLE IF NOT EXISTS`；当前没有可信的迁移账本。
- 旧库、空库和 D1 的基线识别尚未形成语义指纹，不能安全地直接标记为“已迁移”。
- 正式公网仍依赖临时 Tunnel 与单机在线，不具备 HA、固定域名、异地恢复和告警承诺。

## Target Architecture

```text
apps/          运行时入口：web / api / gateway
components/    共享 React 业务组件（按 receivables feature 渐进收敛）
hooks/         前端资源生命周期
services/      前端 API 编排，不含 SQL
lib/domain*    纯业务规则与共享契约
lib/server/    HTTP → service → repository 的共享后端
db/            schema、runtime ports/adapters、未来 migration catalog
drizzle/       版本控制的数据库变更产物
infrastructure/（需求出现时）launchd/nginx/managed tunnel 配置
docs/          architecture / adr / operations / deployment
tests/         当前保持平铺；数量增长后再按 unit/integration/e2e 分区
```

当前不新建空壳 `packages/*`，也不批量移动数百个 import。只有出现第二个真实消费者或稳定公共边界时，才把 domain、API contract、UI 或 config 提升为 workspace package。

## Migration Strategy

1. 保留 SQLite 作为当前单机正式数据库，PostgreSQL 只保留设计出口。
2. 建立一个应用拥有的迁移目录和单表、分 scope 的账本：`core` 同时服务 SQLite/D1，`native-auth` 只服务自托管。
3. 旧库只有通过列、约束、索引和外键的语义指纹后才能登记 baseline；`app_meta` 和幂等 DDL 不能单独作为证明。
4. 本机首次采纳或任何待执行迁移前先生成一致性备份；失败即停止启动，不自动回滚或覆盖原库。
5. D1 在证明批次失败回滚和并发抢占前，保留现入口；长期由部署步骤执行同一迁移目录。
6. Reference data 与 demo seed 独立于 Schema migration。

## Risk

| 风险               | 当前控制                       | 仍需完成                              |
| ------------------ | ------------------------------ | ------------------------------------- |
| 旧库被错误基线化   | 本轮不切换正式迁移执行器       | 语义指纹、复制库夹具、漂移拒绝测试    |
| 财务写入部分成功   | 原子 batch、条件写、审计同事务 | 全写接口幂等键                        |
| D1/SQLite 行为差异 | 共享 port + 双运行时集成测试   | D1 迁移并发/失败专项测试              |
| 单机或隧道离线     | live/ready、备份、进程监督     | 固定 Tunnel、告警、开机服务、异地备份 |
| 目录再次失控       | 本文职责表、ADR、渐进迁移      | 新模块必须声明 owner 与依赖方向       |

## 依赖方向

UI 不访问 SQL；Route 不承载长业务规则；Repository 不依赖 React；Domain 不依赖 HTTP、数据库或运行时。跨层契约优先放在 `lib/api-contract.ts`、`lib/types.ts` 和 `db/ports.ts`，确认有第二个消费者后再提升为 package。

相关决策：[渐进式模块架构 ADR](../adr/0001-evolutionary-modular-architecture.md)、[迁移与健康契约 ADR](../adr/0002-migrations-and-health.md)、[自托管手册](../SELF_HOSTING.md)。
