import { describe, expect, it } from "vitest";
import { buildHourBins, assignCategories, calculateContextSwitches, findCategory, getDayWindow } from "./analytics";
import { correlateWebDomains } from "../server/analytics-service";
import type { ActiveSegment, DashboardCategory } from "./types";

const categories: DashboardCategory[] = [
  { id: "first", name: { "zh-CN": "第一", en: "First" }, color: "#111111", rules: [{ id: "a", field: "title", match: "contains", pattern: "Code", caseSensitive: false, source: "manual" }] },
  { id: "second", name: { "zh-CN": "第二", en: "Second" }, color: "#222222", rules: [{ id: "b", field: "app", match: "regex", pattern: "code", caseSensitive: false, source: "manual" }] },
  { id: "invalid", name: { "zh-CN": "无效", en: "Invalid" }, color: "#333333", rules: [{ id: "bad", field: "title", match: "regex", pattern: "[", caseSensitive: false, source: "manual" }] },
  { id: "uncategorized", name: { "zh-CN": "未分类", en: "Uncategorized" }, color: "#999999", rules: [] },
];

function segment(id: string, start: string, duration: number, app = "code.exe", categoryId = "first"): ActiveSegment {
  return {
    id,
    start,
    end: new Date(Date.parse(start) + duration * 1000).toISOString(),
    duration,
    app,
    appLabel: app,
    title: "Code project",
    categoryId,
    categoryName: { "zh-CN": categoryId, en: categoryId },
    color: "#111111",
  };
}

describe("getDayWindow", () => {
  it("uses a 04:00 local activity day", () => {
    const result = getDayWindow("2026-08-13", "Australia/Sydney", "04:00");
    expect(result.start).toBe("2026-08-12T18:00:00.000Z");
    expect(result.end).toBe("2026-08-13T18:00:00.000Z");
  });

  it("handles the 23-hour Sydney daylight-saving transition", () => {
    const result = getDayWindow("2026-10-04", "Australia/Sydney", "04:00");
    expect((Date.parse(result.end) - Date.parse(result.start)) / 3_600_000).toBe(24);
    const midnightBoundary = getDayWindow("2026-10-04", "Australia/Sydney", "00:00");
    expect((Date.parse(midnightBoundary.end) - Date.parse(midnightBoundary.start)) / 3_600_000).toBe(23);
    const activityDay = getDayWindow("2026-10-03", "Australia/Sydney", "04:00");
    expect((Date.parse(activityDay.end) - Date.parse(activityDay.start)) / 3_600_000).toBe(23);
  });
});

describe("categories", () => {
  it("uses first-match priority and ignores invalid regex rules", () => {
    const result = assignCategories([segment("1", "2026-08-13T00:00:00Z", 30)], categories);
    expect(result[0].categoryId).toBe("first");
  });

  it("uses visible category order and supports exact domains", () => {
    const ordered: DashboardCategory[] = [
      { id: "manual", name: { "zh-CN": "手动", en: "Manual" }, color: "#222222", rules: [{ id: "manual-rule", field: "domain", match: "equals", pattern: "github.com", caseSensitive: false, source: "manual" }] },
      { id: "app", name: { "zh-CN": "应用", en: "App" }, color: "#111111", rules: [{ id: "app-rule", field: "app", match: "equals", pattern: "code.exe", caseSensitive: false, source: "manual" }] },
      categories.at(-1)!,
    ];
    expect(findCategory({ app: "code.exe", title: "repo", domain: "github.com" }, ordered).id).toBe("manual");
  });

  it("associates a browser domain by overlap and records its coverage", () => {
    const windows = [segment("window", "2026-08-13T00:00:00Z", 100, "chrome.exe")];
    const web = [{ ...segment("web", "2026-08-13T00:00:10Z", 80, "Browser"), domain: "example.com" }];
    const [joined] = correlateWebDomains(windows, web);
    expect(joined.domain).toBe("example.com");
    expect(joined.domainCoverage).toBe(0.8);
  });
});

describe("context switches", () => {
  it("counts only application changes between meaningful segments", () => {
    const items = [
      segment("1", "2026-08-13T00:00:00Z", 30, "code.exe"),
      segment("2", "2026-08-13T00:00:30Z", 2, "popup.exe"),
      segment("3", "2026-08-13T00:00:32Z", 30, "chrome.exe"),
    ];
    expect(calculateContextSwitches(items, 5)).toBe(1);
  });
});


describe("hour bins", () => {
  it("splits activities across hours and clips records outside the 24-hour window", () => {
    const bins = buildHourBins([
      segment("cross", "2026-08-13T00:30:00Z", 5400),
      segment("before", "2026-08-12T23:30:00Z", 3600),
      segment("after", "2026-08-13T23:30:00Z", 3600),
    ], "2026-08-13T00:00:00Z", "Australia/Sydney");
    expect(bins).toHaveLength(24);
    expect(bins[0]).toMatchObject({ label: "10:00", duration: 3600 });
    expect(bins[1].duration).toBe(3600);
    expect(bins[23].duration).toBe(1800);
    expect(bins.reduce((sum, bin) => sum + bin.duration, 0)).toBe(9000);
  });

  it("keeps elapsed-hour labels correct when Sydney daylight saving changes", () => {
    const bins = buildHourBins([segment("dst", "2026-10-03T15:30:00Z", 7200)], "2026-10-03T14:00:00Z", "Australia/Sydney");
    expect(bins.slice(0, 4).map((bin) => bin.label)).toEqual(["00:00", "01:00", "03:00", "04:00"]);
    expect(bins.slice(0, 4).map((bin) => bin.duration)).toEqual([0, 1800, 3600, 1800]);
  });
});
