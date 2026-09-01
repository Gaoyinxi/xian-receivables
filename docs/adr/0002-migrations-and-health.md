# ADR-0002：数据库迁移所有权与健康检查

- 状态：Accepted，迁移执行器待实现
- 日期：2026-09-01

## Context

Drizzle SQL 已进入版本控制，但 SQLite/D1 启动仍执行手写幂等 DDL，且本机 auth 有独立 Schema。直接重放生成 SQL 会在旧库失败，直接记录 baseline 又可能掩盖缺列、约束或索引漂移。

## Decision

未来使用一个应用拥有、运行时中立的迁移目录和一个带 scope 的账本：`core` 用于 SQLite/D1，`native-auth` 仅用于本机正式认证。迁移 SQL 与账本记录必须同一原子批次；已应用 checksum 不可改写；未知高版本、断号或 checksum 漂移均拒绝启动。

旧库必须先通过语义结构分类并完成备份，才能登记 baseline。Schema migration、参考区县/风险规则和 demo seed 分开执行。本轮不在缺少这些证据时切换正式数据库。

健康契约：

- `/api/health/live`：只证明进程和网关链路响应，不访问数据库或附件目录。
- `/api/health/ready`：只读检查核心表和附件目录访问能力，失败返回 503。
- `/api/health`：兼容别名，语义等同 readiness。
- `/api/v1/*`：沿用相同语义，并由 v1 envelope 包装。

健康响应不暴露路径、表名、异常、记录数量或财务内容。监督进程和 Compose 使用 readiness；未来独立进程重启探针使用 liveness。

## Consequences

- 运维可以区分进程存活与依赖可用性。
- 迁移切换必须晚于复制库夹具、旧库指纹、D1 原子/并发测试和恢复演练。
- 继续使用 SQLite 是当前单机、小团队、低并发写入的明确选择；多实例/HA/外部分析成为真实需求后，另立 PostgreSQL ADR。

参考：[Drizzle migrations](https://orm.drizzle.team/docs/migrations)、[Node SQLite backup](https://nodejs.org/api/sqlite.html#sqlitebackupsourceDb-path-options)。
