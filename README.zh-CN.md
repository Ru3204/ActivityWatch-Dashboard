# ActivityWatch-Dashboard

[English](README.md) | **简体中文**

一个基于 React 和 Express 的本地 [ActivityWatch](https://activitywatch.net/) 仪表盘，将 ActivityWatch 已采集的活动记录展示为应用统计、时间线和使用趋势。

本项目是配套界面，不负责采集活动。需要单独运行 ActivityWatch。本项目只读调用其 API，不修改 ActivityWatch 的原始记录。

## 功能

- 英语和简体中文界面。
- **Overview（概览）**：活跃时间、应用和分类统计、每小时活动、网站及最近活动。
- **Timeline（时间线）**：查看指定日期的活动，按需打开分类详情。
- **Trends（趋势）**：最近 7、30、90 天的活动趋势、分类趋势和星期／小时热力图。
- **Categories（分类）**：支持手动规则和导入 ActivityWatch 规则；按顺序匹配，支持精确、包含和正则表达式，并提供预览。
- 可配置时区与活动日边界，默认为 `Australia/Sydney` 和凌晨 04:00。
- 按天缓存统计数据，正在记录的日期更频繁更新，不同趋势范围复用已缓存日期。
- 本地配置、版本冲突检查、原子写入与备份。

应用活动来自窗口和 AFK watcher。网站信息需要对应的浏览器 watcher／扩展；缺少 watcher 时界面会提示。

## 快速开始

需要 Node.js 20+、npm 和 ActivityWatch。ActivityWatch 默认地址为 `http://127.0.0.1:5600`。

在项目目录运行：

```powershell
npm.cmd install
npm.cmd run dev
```

打开 **http://127.0.0.1:15173**。开发模式由 Express 和 Vite 中间件共用一个端口。

生产模式：

```powershell
npm.cmd run build
npm.cmd start
```

修改代码后，生产模式需要重新构建并重启进程；开发模式会自动重新加载。

## Windows 后台服务

```powershell
npm.cmd run startup:install
npm.cmd run startup:status
npm.cmd run startup:uninstall
```

安装过程会构建生产版本，下载并校验 WinSW 2.12.0 x64，再注册自动启动的 Windows 服务。安装和卸载需要管理员权限；安装后关闭终端不会停止服务。

为了兼容已有安装，服务和存储标识仍保留原来的 **Tempo** 名称：

- 服务显示名：`Tempo ActivityWatch Dashboard`。
- 服务 ID：`TempoActivityWatchDashboard`。
- 配置文件：`%LOCALAPPDATA%\Tempo\dashboard-config.json`，安装脚本会让服务使用该目录。
- 服务文件与日志：`%ProgramData%\Tempo`。

重新构建后，在管理员 PowerShell 中重启已安装的服务：

```powershell
Restart-Service -Name TempoActivityWatchDashboard
```

项目或 Node.js 安装位置变化后，重新运行 `startup:install`。卸载服务会保留本地数据与日志。

## 数据与隐私

| 数据 | 所属应用 | 本项目的处理方式 |
| --- | --- | --- |
| 窗口、AFK、浏览器和 Stopwatch 记录 | ActivityWatch | 通过本地 API 读取，不修改 |
| 设置与分类规则 | ActivityWatch-Dashboard | 保存为本地 JSON，并备份 |
| 窗口标题与完整 URL | ActivityWatch | 为分析和展示读取，不在本项目持久化 |
| 分析缓存 | ActivityWatch-Dashboard | 仅保存在内存，服务重启后清空 |

应用监听 `127.0.0.1:15173`，只接受指向本机的 ActivityWatch 地址。面向个人本地使用，未提供登录认证、远程托管或跨设备同步。

## 项目结构

```text
src/       React 页面、组件与翻译
server/    Express API、ActivityWatch 客户端、统计与配置存储
shared/    共用 TypeScript 类型和统计函数
scripts/   Windows 服务安装与管理
e2e/       Playwright 浏览器测试
docs/      架构与学习文档
```

## 验证

```powershell
npm.cmd run typecheck
npm.cmd run lint
npm.cmd test
npm.cmd run build
npm.cmd run test:e2e
```

API 测试需要连接本机端口的权限；存储测试需要创建、重命名临时文件的权限；浏览器测试使用 `playwright.config.ts` 中配置的服务。
