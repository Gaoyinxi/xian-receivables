# Architecture upgrade todo

- [x] 审计当前架构和脏工作树
- [x] 记录 ADR 与目标目录职责
- [x] 增加 live / ready / compatibility health 契约
- [ ] 使用脱敏复制库建立 native/D1 旧 Schema 语义指纹
- [ ] 实现 scoped migration ledger 与 checksum/gap/drift 拒绝
- [ ] 验证 D1 迁移失败回滚与并发抢占
- [ ] 首次正式迁移前生成备份并演练新目录恢复
- [ ] 财务写接口增加持久化幂等键
- [ ] 配置固定域名 Tunnel、开机服务、日志轮转和异地备份
