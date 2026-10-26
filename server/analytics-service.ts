import { DateTime } from "luxon";
import { ActivityWatchClient, type ActivityWatchSettings } from "./activitywatch";
import { MemoryCache } from "./cache";
import {
  assignCategories,
  buildHourBins,
  calculateContextSwitches,
  getDayWindow,
  groupBreakdown,
  matchingCategoryIds,
  prettyAppName,
} from "../shared/analytics";
import type {
  ActiveSegment,
  ActivityWatchBucket,
  ActivityWatchEvent,
  CategoryPreviewResponse,
  DashboardCategory,
  DashboardConfig,
  DataQuality,
  HostCapabilities,
  OverviewResponse,
  StatusResponse,
  TimelineResponse,
  TrendsResponse,
} from "../shared/types";

interface QueryBundle {
  window: ActivityWatchEvent[];
  afk: ActivityWatchEvent[];
  active: ActivityWatchEvent[];
  stopwatch: ActivityWatchEvent[];
  web: ActivityWatchEvent[];
}

interface DayData {
  date: string;
  start: string;
  end: string;
  segments: ActiveSegment[];
  stopwatchSeconds: number;
  websites: ActiveSegment[];
  quality: DataQuality[];
  hours?: ReturnType<typeof buildHourBins>;
}

interface DayOptions {
  includeDomains?: boolean;
  includeWebsites?: boolean;
}

export class AnalyticsService {
  private readonly cache = new MemoryCache();

  clearCache() { this.cache.clear(); }

  private client(config: DashboardConfig) {
    return new ActivityWatchClient(config.activityWatchUrl.replace(/\/$/, ""));
  }

  async discover(config: DashboardConfig) {
    const client = this.client(config);
    const [info, buckets, settings] = await Promise.all([
      client.getInfo(),
      client.getBuckets(),
      client.getSettings().catch((): ActivityWatchSettings => ({})),
    ]);
    const hostNames = new Set(buckets.map((bucket) => bucket.hostname).filter((host) => Boolean(host) && host !== "unknown"));
    hostNames.add(info.hostname);
    const hosts = [...hostNames].map((host) => this.capabilities(host, buckets));
    return { info, buckets, settings, hosts };
  }

  async getStatus(config: DashboardConfig): Promise<StatusResponse> {
    try {
      const { info, hosts, settings } = await this.discover(config);
      const selected = hosts.find((host) => host.host === (config.selectedHost ?? info.hostname));
      const warnings: string[] = [];
      if (!selected?.window) warnings.push("missing-window");
      if (!selected?.afk) warnings.push("missing-afk");
      if (!selected?.web) warnings.push("missing-web");
      return {
        connected: true,
        serverVersion: info.version,
        serverHostname: info.hostname,
        hosts,
        dayStart: config.followActivityWatchDayStart && settings.startOfDay ? settings.startOfDay : config.dayStart,
        warnings,
        checkedAt: new Date().toISOString(),
      };
    } catch {
      return {
        connected: false,
        serverVersion: null,
        serverHostname: null,
        hosts: [],
        dayStart: config.dayStart,
        warnings: ["activitywatch-offline"],
        checkedAt: new Date().toISOString(),
      };
    }
  }

  async getTimeline(config: DashboardConfig, date: string, host?: string): Promise<TimelineResponse> {
    const resolvedHost = await this.resolveHost(config, host);
    const day = await this.getDay(config, date, resolvedHost);
    return {
      date,
      host: resolvedHost,
      window: { start: day.start, end: day.end, dayStart: await this.dayStart(config), timezone: config.timezone },
      segments: day.segments,
      dataQuality: day.quality,
    };
  }

  async getOverview(config: DashboardConfig, date: string, host?: string): Promise<OverviewResponse> {
    const resolvedHost = await this.resolveHost(config, host);
    const previousDate = DateTime.fromISO(date, { zone: config.timezone }).minus({ days: 1 }).toISODate()!;
    const [day, previous] = await Promise.all([
      this.getDay(config, date, resolvedHost, false, {
        includeDomains: needsDomainCategories(config.categories),
        includeWebsites: true,
      }),
      this.getDay(config, previousDate, resolvedHost, false, { includeDomains: false, includeWebsites: false }),
    ]);
    const apps = groupBreakdown(day.segments, (segment) => segment.app.toLowerCase(), (segment) => segment.appLabel);
    const categories = groupBreakdown(
      day.segments,
      (segment) => segment.categoryId,
      (segment) => segment.categoryName[config.locale],
      (segment) => segment.color,
    );
    const websites = groupBreakdown(day.websites, (segment) => segment.domain ?? "", (segment) => segment.domain ?? "");
    return {
      date,
      host: resolvedHost,
      window: { start: day.start, end: day.end, dayStart: await this.dayStart(config), timezone: config.timezone },
      activeSeconds: sumDuration(day.segments),
      previousActiveSeconds: sumDuration(previous.segments),
      contextSwitches: calculateContextSwitches(day.segments, config.analytics.contextSwitchMinimumSeconds),
      stopwatchSeconds: day.stopwatchSeconds,
      topApp: apps[0] ?? null,
      apps: apps.slice(0, 12),
      categories,
      websites: websites.slice(0, 10),
      hours: day.hours ??= buildHourBins(day.segments, day.start, config.timezone),
      recentSegments: [...day.segments].sort((a, b) => b.start.localeCompare(a.start)).slice(0, 12),
      dataQuality: day.quality,
      generatedAt: new Date().toISOString(),
    };
  }

  async getTrends(config: DashboardConfig, days: number, host?: string): Promise<TrendsResponse> {
    const resolvedHost = await this.resolveHost(config, host);
    const today = DateTime.now().setZone(config.timezone).toISODate()!;
    const dates = Array.from({ length: days }, (_, index) =>
      DateTime.fromISO(today, { zone: config.timezone }).minus({ days: days - index - 1 }).toISODate()!,
    );
    const dayData = await this.getDays(config, dates, resolvedHost, false, {
      includeDomains: needsDomainCategories(config.categories),
      includeWebsites: false,
    });
    const allSegments = dayData.flatMap((day) => day.segments);
    const daily = dayData.map((day) => {
      const categoryMap: Record<string, number> = {};
      for (const item of groupBreakdown(day.segments, (segment) => segment.categoryId, (segment) => segment.categoryId)) {
        categoryMap[item.key] = item.duration;
      }
      return {
        date: day.date,
        activeSeconds: sumDuration(day.segments),
        contextSwitches: calculateContextSwitches(day.segments, config.analytics.contextSwitchMinimumSeconds),
        categories: categoryMap,
      };
    });
    const weekdayHours = new Map<string, { weekday: number; hour: number; duration: number }>();
    for (const day of dayData) {
      const weekday = DateTime.fromISO(day.date).weekday;
      for (const bin of (day.hours ??= buildHourBins(day.segments, day.start, config.timezone))) {
        const hour = Number(bin.label.slice(0, 2));
        const key = `${weekday}-${hour}`;
        const current = weekdayHours.get(key) ?? { weekday, hour, duration: 0 };
        current.duration += bin.duration;
        weekdayHours.set(key, current);
      }
    }
    return {
      host: resolvedHost,
      days,
      range: { start: dates[0], end: dates.at(-1)! },
      daily,
      apps: groupBreakdown(allSegments, (segment) => segment.app.toLowerCase(), (segment) => segment.appLabel).slice(0, 12),
      categories: groupBreakdown(
        allSegments,
        (segment) => segment.categoryId,
        (segment) => segment.categoryName[config.locale],
        (segment) => segment.color,
      ),
      weekdayHours: [...weekdayHours.values()],
      dataQuality: uniqueQuality(dayData.flatMap((day) => day.quality)),
      generatedAt: new Date().toISOString(),
    };
  }

  async previewCategories(
    config: DashboardConfig,
    categories: DashboardCategory[],
    date: string,
    host?: string,
  ): Promise<CategoryPreviewResponse> {
    const resolvedHost = await this.resolveHost(config, host);
    const baseline = await this.getDay(config, date, resolvedHost, true, {
      includeDomains: needsDomainCategories(config.categories) || needsDomainCategories(categories),
      includeWebsites: false,
    });
    const segments = assignCategories(baseline.segments, categories);
    const breakdown = groupBreakdown(
      segments,
      (segment) => segment.categoryId,
      (segment) => segment.categoryName[config.locale],
      (segment) => segment.color,
    );
    const matched = segments.filter((segment) => segment.categoryId !== "uncategorized");
    const baselineById = new Map(baseline.segments.map((segment) => [segment.id, segment]));
    return {
      totalSegments: segments.length,
      matchedSegments: matched.length,
      newlyMatchedSegments: segments.filter((segment) => segment.categoryId !== "uncategorized" && baselineById.get(segment.id)?.categoryId === "uncategorized").length,
      lostMatchedSegments: segments.filter((segment) => segment.categoryId === "uncategorized" && baselineById.get(segment.id)?.categoryId !== "uncategorized").length,
      changedCategorySegments: segments.filter((segment) => {
        const before = baselineById.get(segment.id)?.categoryId;
        return Boolean(before && before !== segment.categoryId && before !== "uncategorized" && segment.categoryId !== "uncategorized");
      }).length,
      conflictingSegments: segments.filter((segment) => matchingCategoryIds(segment, categories).length > 1).length,
      unmatchedSegments: segments.length - matched.length,
      breakdown,
      examples: segments.slice(0, 20).map((segment) => ({ app: segment.app, title: segment.title, categoryId: segment.categoryId })),
    };
  }

  private capabilities(host: string, buckets: ActivityWatchBucket[]): HostCapabilities {
    const types = new Set(buckets.filter((bucket) => bucket.hostname === host || bucket.hostname === "unknown").map((bucket) => bucket.type));
    return {
      host,
      window: types.has("currentwindow"),
      afk: types.has("afkstatus"),
      stopwatch: types.has("general.stopwatch"),
      web: types.has("web.tab.current"),
    };
  }

  private async resolveHost(config: DashboardConfig, requested?: string) {
    const { info, hosts } = await this.discover(config);
    const host = requested || config.selectedHost || info.hostname;
    if (!hosts.some((candidate) => candidate.host === host)) throw new Error("Unknown ActivityWatch host");
    return host;
  }

  private async dayStart(config: DashboardConfig) {
    if (!config.followActivityWatchDayStart) return config.dayStart;
    try { return (await this.client(config).getSettings()).startOfDay ?? config.dayStart; }
    catch { return config.dayStart; }
  }

  private async getDay(config: DashboardConfig, date: string, host: string, bypassCache = false, options: DayOptions = {}) {
    const [day] = await this.getDays(config, [date], host, bypassCache, options);
    return day;
  }

  private async getDays(config: DashboardConfig, dates: string[], host: string, bypassCache = false, options: DayOptions = {}): Promise<DayData[]> {
    const { includeDomains = true, includeWebsites = true } = options;
    const dayStart = await this.dayStart(config);
    const keyFor = (date: string) => JSON.stringify({
      kind: "day", date, host, dayStart, timezone: config.timezone, activityWatchUrl: config.activityWatchUrl,
      categories: config.categories, analytics: config.analytics, includeDomains, includeWebsites,
    });
    const cachedDays = new Map<string, DayData>();
    if (!bypassCache) {
      for (const date of dates) {
        const cached = this.cache.get<DayData>(keyFor(date));
        if (cached) cachedDays.set(date, cached);
      }
    }
    const missingDates = [...new Set(dates.filter((date) => !cachedDays.has(date)))];
    if (!missingDates.length) return dates.map((date) => cachedDays.get(date)!);

    const client = this.client(config);
    const { buckets } = await this.discover(config);
    const selected = buckets.filter((bucket) => bucket.hostname === host || bucket.hostname === "unknown");
    const windowBucket = newestBucket(selected, "currentwindow");
    const afkBucket = newestBucket(selected, "afkstatus");
    const stopwatchBucket = newestBucket(selected, "general.stopwatch");
    const webBucket = newestBucket(selected, "web.tab.current");
    const windows = missingDates.map((date) => ({ date, ...getDayWindow(date, config.timezone, dayStart) }));
    if (!windowBucket) {
      const emptyDays: DayData[] = windows.map((window) => ({
        date: window.date,
        start: window.start,
        end: window.end,
        segments: [],
        stopwatchSeconds: 0,
        websites: [],
        quality: [{ code: "missing-window", severity: "warning" }],
      }));
      for (const day of emptyDays) cachedDays.set(day.date, day);
      return dates.map((date) => cachedDays.get(date)!);
    }

    const query = makeQuery(windowBucket.id, afkBucket?.id, stopwatchBucket?.id, includeDomains || includeWebsites ? webBucket?.id : undefined);
    const bundles = await client.query<QueryBundle>(query, windows.map((window) => `${window.start}/${window.end}`));
    const result = windows.map((window, index): DayData => {
      const bundle = bundles[index] ?? { window: [], afk: [], active: [], stopwatch: [], web: [] };
      const quality: DataQuality[] = [];
      let activeEvents = bundle.active ?? [];
      if (!afkBucket) quality.push({ code: "missing-afk", severity: "warning" });
      else if ((bundle.window?.length ?? 0) > 0 && (bundle.afk?.length ?? 0) === 0) {
        quality.push({ code: "partial-afk", severity: "warning" });
        activeEvents = bundle.window;
      }
      if (!webBucket) quality.push({ code: "missing-web", severity: "info" });
      if ((bundle.window?.length ?? 0) === 0) quality.push({ code: "empty-range", severity: "info" });
      const websites = includeDomains || includeWebsites ? toSegments(bundle.web ?? [], true) : [];
      const windows = toSegments(activeEvents, false);
      const baseSegments = includeDomains ? correlateWebDomains(windows, websites) : windows;
      const segments = assignCategories(baseSegments, config.categories);
      return {
        date: window.date,
        start: window.start,
        end: window.end,
        segments,
        stopwatchSeconds: (bundle.stopwatch ?? []).reduce((sum, event) => sum + Math.max(0, event.duration), 0),
        websites: includeWebsites ? websites : [],
        quality,
      };
    });
    for (const day of result) {
      // An activity day may still be open after midnight (e.g. a 04:00 boundary).
      const ttlSeconds = Date.parse(day.end) > Date.now() ? 30 : 3600;
      this.cache.set(keyFor(day.date), day, ttlSeconds);
      cachedDays.set(day.date, day);
    }
    return dates.map((date) => cachedDays.get(date)!);
  }
}

export function correlateWebDomains(windowSegments: ActiveSegment[], webSegments: ActiveSegment[]) {
  if (!webSegments.length || !windowSegments.some((segment) => isBrowserApp(segment.app))) return windowSegments;
  return windowSegments.map((segment) => {
    if (!isBrowserApp(segment.app)) return segment;
    let best: ActiveSegment | undefined;
    let bestOverlap = 0;
    const segmentStart = Date.parse(segment.start);
    const segmentEnd = Date.parse(segment.end);
    for (const website of webSegments) {
      if (!website.domain) continue;
      const overlap = Math.max(0, Math.min(segmentEnd, Date.parse(website.end)) - Math.max(segmentStart, Date.parse(website.start))) / 1_000;
      if (overlap > bestOverlap) { best = website; bestOverlap = overlap; }
    }
    if (!best?.domain || bestOverlap <= 0) return segment;
    return { ...segment, domain: best.domain, domainCoverage: Math.min(1, bestOverlap / segment.duration) };
  });
}

function needsDomainCategories(categories: DashboardCategory[]) {
  return categories.some((category) => category.id !== "uncategorized" && category.rules.some((rule) => rule.field === "domain"));
}

function isBrowserApp(app: string) {
  const name = app.split(/[\\/]/).at(-1)!.replace(/\.(exe|app)$/i, "");
  return /^(chrome|google chrome(?: canary)?|chromium|msedge|microsoft edge|firefox|firefox-esr|brave|brave browser|opera|opera gx|vivaldi|safari|arc|zen|zen browser|waterfox|librewolf|browser)$/i.test(name);
}

function newestBucket(buckets: ActivityWatchBucket[], type: string) {
  return buckets.filter((bucket) => bucket.type === type).sort((a, b) => b.created.localeCompare(a.created))[0];
}

function queryBucket(id?: string) {
  return id ? `query_bucket(${JSON.stringify(id)})` : "[]";
}

function makeQuery(windowId: string, afkId?: string, stopwatchId?: string, webId?: string) {
  const lines = [
    `window_events = ${queryBucket(windowId)};`,
    `afk_events = ${queryBucket(afkId)};`,
  ];
  if (afkId) {
    lines.push('not_afk = filter_keyvals(afk_events, "status", ["not-afk"]);');
    lines.push("active_events = filter_period_intersect(window_events, not_afk);");
  } else {
    lines.push("not_afk = [];");
    lines.push("active_events = window_events;");
  }
  lines.push(`stopwatch_events = ${queryBucket(stopwatchId)};`);
  lines.push(`web_events = ${queryBucket(webId)};`);
  if (afkId && webId) lines.push("web_events = filter_period_intersect(web_events, not_afk);");
  lines.push('RETURN = {"window": window_events, "afk": afk_events, "active": active_events, "stopwatch": stopwatch_events, "web": web_events};');
  return lines;
}

function toSegments(events: ActivityWatchEvent[], web: boolean): ActiveSegment[] {
  return events.filter((event) => event.duration > 0).map((event, index) => {
    const app = web ? "Browser" : String(event.data.app ?? "Unknown");
    const title = String(event.data.title ?? event.data.label ?? "");
    const start = DateTime.fromISO(event.timestamp, { setZone: true }).toUTC();
    const url = web && typeof event.data.url === "string" ? event.data.url : undefined;
    let domain: string | undefined;
    if (url) {
      try { domain = new URL(url).hostname.replace(/^www\./, ""); } catch { /* invalid watcher URL */ }
    }
    return {
      // ActivityWatch 偶尔会在同一次查询中返回具有相同事件 ID 和时间戳的片段。
      // React 需要列表项拥有真正唯一的身份，因此保留查询顺序作为最后一段标识。
      id: `${event.id ?? "event"}-${event.timestamp}-${index}`,
      start: start.toISO()!,
      end: start.plus({ seconds: event.duration }).toISO()!,
      duration: event.duration,
      app,
      appLabel: prettyAppName(app),
      title,
      categoryId: "uncategorized",
      categoryName: { "zh-CN": "未分类", en: "Uncategorized" },
      color: "#94a3b8",
      url,
      domain,
    };
  });
}

function sumDuration(segments: ActiveSegment[]) {
  return segments.reduce((sum, segment) => sum + segment.duration, 0);
}

function uniqueQuality(items: DataQuality[]) {
  return [...new Map(items.map((item) => [item.code, item])).values()];
}
