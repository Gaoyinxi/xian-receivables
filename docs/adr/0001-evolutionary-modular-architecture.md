# ADR-0001：采用渐进式模块架构

- 状态：Accepted
- 日期：2026-09-01

## Context

工程同时保留 Sites 与自托管入口，并已有共享业务 Handler、数据库 Port、前端业务组件和三进程部署。直接改造成完整 `apps/* + packages/* + infrastructure/*` Monorepo 会产生大量无业务收益的 import、构建和部署变更。

## Decision

保留现有 workspace 和运行时入口，以明确依赖方向和按领域渐进迁移代替批量搬家。新后端业务沿 `route → handler → service → repository → SqlDatabase`；前端沿 `view → feature component/hook → service → api client`。只有出现真实复用边界后才建立 package。

## Consequences

- 现有构建、D1/R2、自托管 SQLite 和测试保持兼容。
- 短期仍会看到根级共享目录，但职责由架构索引约束。
- 每次迁移一个业务链路并保留对照测试；不得为了“整洁”同时移动不相关文件。
