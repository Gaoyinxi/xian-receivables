# Architecture upgrade plan

## Scope

在不移动正式数据、不重写业务和不批量搬目录的前提下，固化工程边界、健康契约与安全迁移路线。

## Phases

1. 已完成：审计 apps/components/lib/app-api/db/tests/运行脚本与未提交改动。
2. 已完成：确定渐进式模块架构、SQLite 保留策略、Scoped migration ledger 方案。
3. 本轮：实现 live/ready/兼容 health，更新监督进程、Compose、文档和测试。
4. 后续：构建旧库语义指纹与复制夹具，证明 D1 原子/并发，再切换迁移执行器。
5. 后续：补财务幂等键、服务端分页、固定 Tunnel/开机服务、异地备份和告警。

## Acceptance criteria for this increment

- liveness 不访问依赖；readiness 只读检查数据库与存储。
- 旧 `/health` 与 `/api/v1` 保持兼容，响应不泄露内部信息。
- 正式数据库和附件无迁移、无清理、无示例播种。
- typecheck、lint、unit、integration、build 和 self-host 测试保持通过。
