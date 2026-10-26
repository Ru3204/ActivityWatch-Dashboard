# 重要决策记录（简化 ADR）

ADR 用来保存“当时为什么这么选”。代码只能告诉你现在是什么，不能告诉你哪些约束导致了它。

## ADR-001 服务端持有计时

**Context**：计时需要跨页面、刷新、休眠和重启。**Constraints**：本机单用户，已有 Express。**Decision**：保存 `endsAt + intervals`，服务端状态机管理转换。**Why**：墙上时间可恢复，只有一个状态所有者。**Alternatives**：浏览器 interval 简单但页面关闭即失去所有者；Service Worker 生命周期不保证；Tauri/Electron 更原生但增加打包。**Consequences**：需要 API 和轮询；服务停机期间只能重启后补记。**Revisit when**：需要系统托盘、离线通知或跨设备同步。

## ADR-002 原子 JSON 而非数据库

**Context**：配置和几十/几百条番茄历史需要可靠保存。**Constraints**：单进程、无需复杂查询、用户应能查看/备份文件。**Decision**：schema 校验、串行写、同目录临时文件、flush、rename、五份备份。**Why**：用较低复杂度避免半写文件。**Alternatives**：SQLite 提供事务和查询；PostgreSQL 支持多用户；事件溯源保留全部变化。**Consequences**：简单透明，但无跨进程锁与高效分页。**Revisit when**：历史达到数万、需要编辑/标签/并发写或多进程。

## ADR-003 revision 防旧标签页覆盖

**Context**：两个标签页可能基于不同配置保存。**Constraints**：JSON 没有数据库行锁。**Decision**：每次保存必须带 `expectedRevision`，不一致返回 409。**Why**：冲突可见，避免最后写入者静默获胜。**Alternatives**：last-write-wins 简单但会丢数据；字段 CRDT 适合强协作但复杂；数据库 optimistic locking 原理相同。**Consequences**：UI 必须提供载入最新版或保留草稿。**Revisit when**：出现真正多人协作。

## ADR-004 本地优先

**Context**：活动数据高度敏感。**Constraints**：个人本机工具，不需要远程访问。**Decision**：只监听 loopback，文件放 `%LOCALAPPDATA%\Tempo`，无外部网络。**Why**：缩小攻击面和部署面。**Alternatives**：云同步提升多设备体验，但需要身份、加密、合规和删除策略。**Consequences**：换电脑需手动迁移，不能远程查看。**Revisit when**：用户明确需要多设备且愿意承担安全设计。

## ADR-005 ActivityWatch 只读

**Context**：ActivityWatch 是原始事实来源。**Constraints**：Dashboard 不应破坏采集。**Decision**：仅使用读取端点和 Query API，不提供通用代理。**Why**：Tempo 的 bug 最坏只影响自己的衍生数据。**Alternatives**：双向分类同步体验统一，但需要冲突规则与回滚。**Consequences**：两边分类可能不同。**Revisit when**：ActivityWatch 提供稳定、可版本化且用户明确授权的同步接口。

## ADR-006 标题按需查询

**Context**：标题有价值但可能包含客户名、文档名和消息内容。**Constraints**：复盘需要细节，持久化应最小化。**Decision**：磁盘只存聚合，详情页实时读标题。**Why**：减少备份和日志中的敏感面。**Alternatives**：加密快照能离线查看，但密钥管理和 retention 更复杂。**Consequences**：ActivityWatch 离线时详情不可用。**Revisit when**：离线审计成为核心需求。

## ADR-007 显式配置迁移

**Context**：v3 删除 focus/recognition，用户已有分类。**Constraints**：不能静默重置。**Decision**：读取时按 version 转换，先备份，过滤 auto 规则，保留 imported/manual，并删除旧 learning 文件。**Why**：业务只处理一种 schema，用户数据可恢复。**Alternatives**：永久兼容所有版本会污染业务；强制重新配置伤害用户。**Consequences**：每次 schema 变化都要编写和测试迁移。**Revisit when**：迁移链过长时引入独立 migration runner 或数据库。
