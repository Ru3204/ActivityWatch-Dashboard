import { afterEach, describe, expect, it, vi } from "vitest";
import { AnalyticsService } from "./analytics-service";
import { ActivityWatchClient } from "./activitywatch";
import { DEFAULT_CONFIG } from "../shared/defaults";
import type { ActivityWatchEvent, DashboardConfig } from "../shared/types";

afterEach(() => vi.restoreAllMocks());

function setup() {
  const config: DashboardConfig = structuredClone(DEFAULT_CONFIG);
  config.followActivityWatchDayStart = false;
  vi.spyOn(ActivityWatchClient.prototype, "getInfo").mockResolvedValue({ hostname: "HOST", version: "test" });
  vi.spyOn(ActivityWatchClient.prototype, "getSettings").mockResolvedValue({});
  vi.spyOn(ActivityWatchClient.prototype, "getBuckets").mockResolvedValue([
    { id: "window", type: "currentwindow", client: "window", hostname: "HOST", created: "2026-01-01" },
    { id: "web", type: "web.tab.current", client: "web", hostname: "HOST", created: "2026-01-01" },
  ]);
  const queries: string[] = [];
  const queriedPeriods: string[][] = [];
  vi.spyOn(ActivityWatchClient.prototype, "query").mockImplementation(async <T>(query: string[], periods: string[]): Promise<T[]> => {
    queries.push(query.join("\n"));
    queriedPeriods.push(periods);
    return periods.map((period) => {
      const timestamp = period.split("/")[0];
      const active: ActivityWatchEvent[] = [
        { id: 1, timestamp, duration: 60, data: { app: "chrome.exe", title: "Page" } },
        { id: 2, timestamp, duration: 30, data: { app: "Code.exe", title: "Editor" } },
      ];
      return { window: active, active, afk: [], stopwatch: [], web: [
        { id: 3, timestamp, duration: 60, data: { url: "https://github.com/example", title: "Page" } },
      ] } as T;
    });
  });
  return { config, queries, queriedPeriods, service: new AnalyticsService() };
}

function addDomainRule(config: DashboardConfig) {
  config.categories[0].rules = [{ id: "github", field: "domain", match: "equals", pattern: "github.com", caseSensitive: false, source: "manual" }];
}

describe("optional website correlation", () => {
  it("skips website queries for trends without domain rules and preserves activity totals", async () => {
    const { config, queries, service } = setup();
    const result = await service.getTrends(config, 7);
    expect(queries).toHaveLength(1);
    expect(queries[0]).not.toContain('query_bucket("web")');
    expect(result.daily.map((day) => day.activeSeconds)).toEqual(Array(7).fill(90));
    expect(result.apps.map((app) => app.duration)).toEqual([420, 210]);
  });

  it("retains domain classification for trends, only on browser records", async () => {
    const { config, queries, service } = setup();
    addDomainRule(config);
    const result = await service.getTrends(config, 7);
    expect(queries[0]).toContain('query_bucket("web")');
    expect(result.daily[0].categories.work).toBe(60);
    expect(result.daily[0].activeSeconds).toBe(90);
  });

  it("skips previous-day website processing and keeps full timeline data separate in cache", async () => {
    const { config, queries, service } = setup();
    const overview = await service.getOverview(config, "2026-08-13");
    expect(overview.previousActiveSeconds).toBe(90);
    expect(overview.websites[0].key).toBe("github.com");
    expect(queries.filter((query) => query.includes('query_bucket("web")'))).toHaveLength(1);
    const timeline = await service.getTimeline(config, "2026-08-12");
    expect(timeline.segments[0].domain).toBe("github.com");
    expect(timeline.segments[1].domain).toBeUndefined();
    expect(queries).toHaveLength(3);
  });

});


describe("daily cache reuse", () => {
  it("only queries extra days when expanding from 7 to 30 to 90 days", async () => {
    vi.spyOn(Date, "now").mockReturnValue(Date.parse("2026-08-13T02:00:00Z"));
    const { config, service, queriedPeriods } = setup();
    await service.getTrends(config, 7);
    const thirty = await service.getTrends(config, 30);
    await service.getTrends(config, 90);
    const seven = await service.getTrends(config, 7);
    expect(queriedPeriods.map((periods) => periods.length)).toEqual([7, 23, 60]);
    expect(seven.daily).toEqual(thirty.daily.slice(-7));
  });

  it("refreshes the open day after 30 seconds while reusing history", async () => {
    let now = Date.parse("2026-08-13T02:00:00Z");
    vi.spyOn(Date, "now").mockImplementation(() => now);
    const { config, service, queriedPeriods } = setup();
    await service.getTrends(config, 7);
    now += 31_000;
    await service.getTrends(config, 7);
    expect(queriedPeriods.map((periods) => periods.length)).toEqual([7, 1]);
    now += 3_600_000;
    await service.getTrends(config, 7);
    expect(queriedPeriods.at(-1)).toHaveLength(7);
    service.clearCache();
    await service.getTrends(config, 7);
    expect(queriedPeriods.at(-1)).toHaveLength(7);
  });

  it("refreshes yesterday too when its 04:00 activity-day boundary has not passed", async () => {
    let now = Date.parse("2026-08-12T16:00:00Z"); // 02:00 Sydney on August 13
    vi.spyOn(Date, "now").mockImplementation(() => now);
    const { config, service, queriedPeriods } = setup();
    await service.getTrends(config, 7);
    now += 31_000;
    await service.getTrends(config, 7);
    expect(queriedPeriods.map((periods) => periods.length)).toEqual([7, 2]);
  });
});
