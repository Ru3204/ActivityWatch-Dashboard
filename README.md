# Tempo

Tempo 是一个面向 ActivityWatch 桌面版的本地只读 Dashboard，也是一个用于学习 React、Express 与软件架构边界的小型完整项目。它把 ActivityWatch 已采集的数据变成概览、时间轴和趋势；番茄钟则由 Tempo 主动记录，再用 ActivityWatch 数据回答“这次专注期间实际做了什么”。

## 功能

- 中英双语的 Overview、Timeline、Trends、Categories、Pomodoro 和 Settings。
- 服务端管理的单次番茄钟：15/25/45/60 分钟快捷选项、1–180 分钟自定义、暂停、继续、提前完成和取消。
- 番茄完成后汇总应用、网站、手动分类和上下文切换；ActivityWatch 离线时保留“等待分析”记录。
- 手动及 ActivityWatch 导入的分类规则，支持排序、精确/包含/正则匹配和变更预览；没有隐藏的自动分类器。
- `Australia/Sydney` 时区与 04:00 活动日边界，正确按实际时间拆分跨日番茄。
- 本地配置、番茄历史、原子写盘和最近五份备份；ActivityWatch 始终只读。

## 两类数据的边界

| 数据 | 所有者 | 保存位置 | Tempo 是否修改 ActivityWatch |
| --- | --- | --- | --- |
| 窗口、AFK、网站、Stopwatch | ActivityWatch | ActivityWatch 自己的数据库 | 否，只读 API / Query API |
| 配置与手动分类规则 | Tempo | `%LOCALAPPDATA%\Tempo\dashboard-config.json` | 否 |
| 番茄状态、历史、聚合复盘 | Tempo | `%LOCALAPPDATA%\Tempo\pomodoro.json` | 否 |
| 完整窗口标题、完整 URL | ActivityWatch | Tempo 仅在页面打开时读取 | Tempo 不写盘、不写日志 |

为什么要明确所有权？因为“谁能修改什么”决定了故障范围。Tempo 即使写盘失败，也不应损坏 ActivityWatch 的原始记录；反过来，ActivityWatch 离线也不应阻止番茄钟完成。

## 运行

需要 Node.js 20+。ActivityWatch 默认地址为 `http://127.0.0.1:5600`，但番茄钟在它离线时仍能工作。

```powershell
npm.cmd install
npm.cmd run dev
```

开发页面和本地 API 统一使用 `http://127.0.0.1:15173`。开发模式由 Express 与 Vite 中间件共享同一个端口；生产运行：

```powershell
npm.cmd run build
npm.cmd start
```

## Windows 后台服务

直接运行以下命令；安装和卸载时 Windows 会弹出一次管理员权限确认：

```powershell
npm.cmd run startup:install
npm.cmd run startup:status
npm.cmd run startup:uninstall
```

安装命令会构建生产版本，从 WinSW 官方发布页下载固定的 `2.12.0` x64 版本并校验 SHA-256，然后注册自动启动的 `Tempo ActivityWatch Dashboard` Windows 服务。服务使用低权限 `LocalService` 账户、崩溃后自动重启、静默运行，并且只监听 `127.0.0.1:15173`；关闭所有 Terminal 不会停止它。

Tempo 数据仍保存到 `%LOCALAPPDATA%\Tempo`，安装脚本会授予服务所需的最小目录权限。WinSW 运行文件和滚动日志位于 `%ProgramData%\Tempo`。项目或 Node.js 安装位置变化后，重新运行 `startup:install`。旧的同名计划任务会在安装或卸载时自动移除。预演命令：

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/startup.ps1 install -WhatIf
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/startup.ps1 uninstall -WhatIf
```

## 目录入口

```text
src/       React 页面、全局番茄状态和展示组件
server/    Express API、番茄状态机、ActivityWatch 查询与文件存储
shared/    前后端共同使用的 TypeScript 类型和纯计算函数
docs/      架构、决策、代码导览、行业替代方案与从零搭建教程
scripts/   Windows 计划任务与生产启动入口
e2e/       Playwright 用户流程测试
```

推荐学习顺序：先读 [架构说明](docs/ARCHITECTURE.md)，再沿 [代码导览](docs/CODE-TOUR.md) 跟踪一次番茄；遇到术语查看 [术语表](docs/GLOSSARY.md)。想自己搭一个类似项目时使用 [从零搭建](docs/BUILD-YOUR-OWN.md)，想理解“为什么不换另一种技术”时读 [决策记录](docs/DECISIONS.md) 和 [行业方案比较](docs/INDUSTRY-ALTERNATIVES.md)。

## 验证

```powershell
npm.cmd test
npm.cmd run typecheck
npm.cmd run lint
npm.cmd run build
npm.cmd run test:e2e
```

这些测试不是同一种保险：单元测试保护计算与状态转换，API 测试保护层之间的契约，E2E 测试保护用户真正走过的流程。详见架构文档中的测试边界。

## 当前做得好的地方与限制

做得好的地方：ActivityWatch 只读、配置 revision 防止旧标签页覆盖、番茄状态由后台唯一持有、标题不持久化、迁移前备份、纯计算与 I/O 分离。

仍是个人本地应用，而不是大型生产系统：只有单用户、进程内调度、JSON 文件、REST 轮询，没有登录、远程部署、任务队列、数据库事务和跨设备同步。这不是“偷工减料”，而是按当前约束控制复杂度；达到何种规模应该升级，见 [行业方案比较](docs/INDUSTRY-ALTERNATIVES.md)。
