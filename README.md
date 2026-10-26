# ActivityWatch-Dashboard

**English** | [简体中文](README.zh-CN.md)

A local dashboard for [ActivityWatch](https://activitywatch.net/), built with React and Express. It turns activity already collected by ActivityWatch into application breakdowns, timelines, and usage trends.

This project is a companion UI, not an activity collector. ActivityWatch must be running separately. Its APIs are used read-only; the dashboard does not modify ActivityWatch records.

## Features

- English and Simplified Chinese interface.
- **Overview:** active time, application and category breakdowns, hourly activity, websites, and recent activity.
- **Timeline:** inspect activity for a selected date and open category details on demand.
- **Trends:** compare the last 7, 30, or 90 days, with category trends and a weekday/hour heatmap.
- **Categories:** ordered manual rules and imported ActivityWatch rules, with exact, contains, and regular-expression matching plus preview.
- Configurable timezone and activity-day boundary; defaults to `Australia/Sydney` and 04:00.
- Per-day in-memory caching, with shorter expiry for open activity days and reuse across trend ranges.
- Local configuration, revision checks, atomic writes, and backups.

Window and AFK watchers provide application activity. Website information requires a supported browser watcher/extension. Missing watchers are reported in the dashboard.

## Quick start

Requirements: Node.js 20+, npm, and ActivityWatch (default address: `http://127.0.0.1:5600`).

Run from the project directory:

```powershell
npm.cmd install
npm.cmd run dev
```

Open **http://127.0.0.1:15173**. Express serves the API and Vite development middleware on the same port.

For a production build:

```powershell
npm.cmd run build
npm.cmd start
```

After changing source code, rebuild and restart the production process. Development mode reloads changes automatically.

## Windows background service

```powershell
npm.cmd run startup:install
npm.cmd run startup:status
npm.cmd run startup:uninstall
```

Installation builds the production app, downloads and verifies WinSW 2.12.0 x64, and registers an automatic Windows service. Installation and removal request administrator permission. Closing the terminal does not stop the installed service.

The existing service and storage identifiers retain the earlier **Tempo** name for compatibility:

- Service display name: `Tempo ActivityWatch Dashboard`.
- Service ID: `TempoActivityWatchDashboard`.
- Configuration: `%LOCALAPPDATA%\Tempo\dashboard-config.json` (the installer configures the service to use this directory).
- Service files and logs: `%ProgramData%\Tempo`.

After rebuilding, restart the installed service in an administrator PowerShell:

```powershell
Restart-Service -Name TempoActivityWatchDashboard
```

If the project or Node.js installation moves, rerun `startup:install`. Uninstalling the service preserves local data and logs.

## Data and privacy

| Data | Owner | Dashboard behavior |
| --- | --- | --- |
| Window, AFK, browser, and stopwatch records | ActivityWatch | Read through its local API; never modified |
| Settings and category rules | ActivityWatch-Dashboard | Saved locally as JSON with backups |
| Window titles and full URLs | ActivityWatch | Retrieved for analysis/display; not persisted by the dashboard |
| Analytics cache | ActivityWatch-Dashboard | In memory; cleared when the server restarts |

The app listens on `127.0.0.1:15173` and accepts only localhost ActivityWatch URLs. It is intended for personal local use; authentication, remote hosting, and cross-device synchronization are not included.

## Project structure

```text
src/       React pages, components, and translations
server/    Express API, ActivityWatch client, analytics, and configuration storage
shared/    Shared TypeScript types and analytics functions
scripts/   Windows service installation and management
e2e/       Playwright browser tests
docs/      Architecture and learning documentation
```

## Checks

```powershell
npm.cmd run typecheck
npm.cmd run lint
npm.cmd test
npm.cmd run build
npm.cmd run test:e2e
```

API tests need permission to connect to local ports. Storage tests need permission to create and rename temporary files. Browser tests use the server configured in `playwright.config.ts`.