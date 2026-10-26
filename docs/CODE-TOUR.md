# 代码导览：一次番茄如何穿过整个系统

阅读目标不是记住所有文件，而是练习追踪“输入、输出、所有权和失败”。建议在编辑器中按下面顺序打开真实代码。

## 1. 用户点击开始

入口是 `src/pages/PomodoroPage.tsx`。页面拥有任务输入和分钟数，因为它们只是尚未提交的 UI 草稿；它不拥有正式计时状态。点击后调用 `PomodoroContext.start`。

为什么不直接在页面写 `setInterval`？页面卸载时 interval 会消失，多标签页会产生多个真相。教程里的五分钟倒计时可以这样简化；需要刷新恢复的应用则必须把状态提升到更稳定的所有者。

## 2. 全局状态与 TanStack Query

`src/pomodoro/PomodoroProvider.tsx` 通过 `GET /api/pomodoro` 每三秒校准一次，只把稳定的 `endsAt` 和领域状态放进全局 Context。`useRemainingSeconds.ts` 在真正显示倒计时的组件内部用 `Date.now()` 每秒更新数字，前端不每秒发请求。

为什么要把这两个频率拆开？如果全局 Provider 每秒更新 `now`，所有 Context 消费者都会重渲染；图表等昂贵组件也可能被连带更新。领域事实应该全局共享，高频但可推导的显示状态应尽量留在叶子组件。这不是“所有局部状态都更好”，而是按状态的所有权和更新范围做选择。

- 输入：API 状态与浏览器当前时间。
- 输出：`active`、`remainingSeconds` 和动作函数。
- 所有权：缓存属于 Query；正式计时属于服务端；组件只拥有显示时钟。
- 失败：API 离线时保留错误提示，不伪造一个新计时器。

TanStack Query 解决的是 server state 的缓存、失效和并发请求，不是所有 React 状态。删掉它也能用 `fetch + useEffect`，但每个页面要重复 loading/error/refetch 逻辑。只有两三个固定请求的小项目可能不需要它。

## 3. API 契约

`src/lib/api.ts` 把 URL 和 DTO 集中起来；`shared/types.ts` 让前后端共享编译期形状。请求进入 `server/app.ts` 后再由 Zod 做运行时校验。

为什么 TypeScript 类型和 Zod 都要有？类型在构建后会消失，不能阻止外部请求发来 `minutes: -9`；Zod 不能让编辑器提前提示调用方拼错字段。大型团队也常用 OpenAPI/代码生成替代手写两份契约。

## 4. 状态机执行转换

`server/pomodoro-service.ts` 的 `start/pause/resume/finish/cancel` 是领域行为。`requireActive` 把非法状态变成 `PomodoroStateError`，路由再映射为 HTTP 409。

暂停时关闭 interval 并计算剩余秒数；继续时创建新 interval 和新 `endsAt`。自动完成使用计划结束时间，提前完成使用请求到达时间。输入是 command 和当前时间，输出是新状态，失败方式是非法转换或存储失败。

如果把判断散在路由里，测试必须通过 HTTP 才能覆盖业务，未来 CLI 或原生 UI 也无法复用。极小 CRUD 项目没有状态转换时，可以不设 Service。

## 5. 原子持久化

`PomodoroService` 调用 `server/pomodoro-store.ts`，Store 再使用 `server/atomic-json-store.ts`。写入过程是：同目录临时文件 → flush → rename，同时保留五份备份。

原因是进程可能在写到一半时退出；直接覆盖主文件可能留下半截 JSON。原子 rename 让读者看到旧完整文件或新完整文件。它仍不是数据库事务：没有跨文件事务、索引或跨进程锁。

## 6. 自动完成与重启恢复

`startReconciler()` 每秒比较 `endsAt`，但不每秒写盘。即使进程停机，`state()` 在下一次读取时也会 `reconcile()`：若计划时间已过，用原 `endsAt` 补记自动完成；暂停状态没有 `endsAt`，所以保持暂停。

这是“从持久化事实推导当前状态”，比保存每一次 tick 更可靠。如果要求进程关闭时仍准时发系统通知，需要 Windows 原生通知/计划任务或 Tauri/Electron 常驻进程，而不是继续增加 JSON 写入频率。

## 7. ActivityWatch 分析

完成记录先以 `analysisStatus: pending` 写入，然后 `AnalyticsService.getActivityForIntervals`：发现当前 host 的 buckets，Query 每个非暂停 interval，与 not-afk 相交，可选关联 web watcher，最后调用 `shared/analytics.ts` 的纯函数分类和聚合。

失败方式包括 ActivityWatch 离线、bucket 缺失或空数据。离线不回滚番茄，只保留 pending。这里体现“失败隔离”：计时成功不依赖分析成功。

## 8. 摘要与详情为何分开

`pomodoro.json` 只保存聚合；`GET /sessions/:id/activity` 在用户打开复盘时重新查询完整片段。代价是 ActivityWatch 离线时看不到标题，收益是 Tempo 的文件、备份与日志没有敏感标题或完整 URL。

大型审计系统可能需要不可变快照，此时会在加密数据库中保存更完整事件，并设置 retention/access control。个人隐私工具的约束不同，因此选择按需查询。

## 9. React 再展示

mutation 成功后 Provider 失效 `pomodoro-sessions`、`overview`、`trends` 查询。页面重新读取服务端事实；Overview 使用真实番茄 interval 与活动日窗口的重叠秒数，Trends 按天拆分。

这条路径体现一个可复用的阅读方法：从用户动作开始，逐层问“谁拥有状态、什么是输入输出、哪里可能失败、失败会不会扩散”。
