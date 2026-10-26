import { access, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { configSchema, ConfigStore, importActivityWatchCategories } from "./config";
import { DEFAULT_CONFIG } from "../shared/defaults";

const tempDirs: string[] = [];
afterEach(async () => Promise.all(tempDirs.splice(0).map((directory) => rm(directory, { recursive: true, force: true }))));

describe("configuration", () => {
  it("imports ActivityWatch rules without writing back", () => {
    const categories = importActivityWatchCategories([{ name: ["Work", "Programming"], data: { color: "#0F0" }, rule: { regex: "code", ignore_case: true } }]);
    expect(categories[0]).toMatchObject({ id: "work-programming", color: "#00FF00" });
    expect(categories[0].rules).toHaveLength(2);
    expect(categories[0].rules[0]).toMatchObject({ field: "app", match: "regex", caseSensitive: false });
    expect(categories[0].rules[1]).toMatchObject({ field: "title", match: "regex", caseSensitive: false });
    expect(categories.at(-1)?.id).toBe("uncategorized");
  });

  it("rejects remote ActivityWatch URLs and invalid regular expressions", () => {
    expect(() => configSchema.parse({ ...DEFAULT_CONFIG, activityWatchUrl: "https://example.com" })).toThrow();
    const config = structuredClone(DEFAULT_CONFIG);
    config.categories[0].rules[0] = { ...config.categories[0].rules[0], match: "regex", pattern: "[" };
    expect(() => configSchema.parse(config)).toThrow();
  });

  it("migrates a legacy project config once and loads it from one stable user directory", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "tempo-config-")); tempDirs.push(root);
    const movedRoot = await mkdtemp(path.join(tmpdir(), "tempo-moved-")); tempDirs.push(movedRoot);
    const dataDir = path.join(root, "local", "Tempo");
    await mkdir(path.join(root, "data"), { recursive: true });
    const legacy: Record<string, unknown> = {
      ...DEFAULT_CONFIG,
      version: 1,
      focus: { contextSwitchMinimumSeconds: 7, categoryIds: [], minimumSessionSeconds: 900, bridgeGapSeconds: 120 },
      categories: DEFAULT_CONFIG.categories.map((category) => ({ ...category, rules: category.rules.map((rule) => ({ id: rule.id, field: rule.field, match: rule.match, pattern: rule.pattern, caseSensitive: rule.caseSensitive })) })),
    };
    delete legacy.revision;
    delete legacy.updatedAt;
    delete legacy.analytics;
    delete legacy.pomodoro;
    await writeFile(path.join(root, "data", "dashboard-config.json"), JSON.stringify(legacy), "utf8");
    const first = new ConfigStore(root, dataDir);
    const migrated = await first.load();
    expect(migrated.version).toBe(3);
    expect(migrated.analytics.contextSwitchMinimumSeconds).toBe(7);
    expect(first.getStorageStatus().state).toBe("migrated");
    const saved = await first.replaceCategories(migrated.categories.map((category) => category.id === "work" ? { ...category, name: { ...category.name, en: "Deep Work" } } : category), migrated.revision);
    const afterMove = await new ConfigStore(movedRoot, dataDir).load();
    expect(afterMove.revision).toBe(saved.revision);
    expect(afterMove.categories[0].name.en).toBe("Deep Work");
  });

  it("recovers the newest valid backup and never overwrites an unrecoverable primary", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "tempo-recovery-")); tempDirs.push(root);
    const dataDir = path.join(root, "Tempo");
    await mkdir(path.join(dataDir, "backups"), { recursive: true });
    await writeFile(path.join(dataDir, "dashboard-config.json"), "not json", "utf8");
    await writeFile(path.join(dataDir, "backups", "dashboard-config-2026.json"), JSON.stringify(DEFAULT_CONFIG), "utf8");
    const recoveredStore = new ConfigStore(root, dataDir);
    expect((await recoveredStore.load()).version).toBe(3);
    expect(recoveredStore.getStorageStatus().state).toBe("recovered");

    const brokenDir = path.join(root, "Broken");
    await mkdir(brokenDir, { recursive: true });
    const brokenPath = path.join(brokenDir, "dashboard-config.json");
    await writeFile(brokenPath, "still broken", "utf8");
    const brokenStore = new ConfigStore(root, brokenDir);
    expect((await brokenStore.load()).version).toBe(3);
    expect(brokenStore.getStorageStatus().state).toBe("memory-fallback");
    expect(await readFile(brokenPath, "utf8")).toBe("still broken");
  });

  it("migrates v2, filters automatic rules and removes the obsolete learning file", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "tempo-v2-")); tempDirs.push(root);
    const dataDir = path.join(root, "Tempo"); await mkdir(dataDir, { recursive: true });
    const first = DEFAULT_CONFIG.categories[0];
    const v2 = {
      ...DEFAULT_CONFIG,
      version: 2,
      revision: 12,
      updatedAt: "2026-08-12T00:00:00.000Z",
      focus: { categoryIds: [first.id], minimumSessionSeconds: 900, bridgeGapSeconds: 120, contextSwitchMinimumSeconds: 9 },
      recognition: { enabled: true, autoApplyThreshold: 0.92, lookbackDays: 30, minimumSupportSeconds: 1800, minimumDistinctDays: 3, scanIntervalHours: 24 },
      categories: DEFAULT_CONFIG.categories.map((category, index) => index === 0 ? { ...category, rules: [
        ...category.rules,
        { id: "auto-rule", field: "app", match: "equals", pattern: "auto.exe", caseSensitive: false, source: "auto", confidence: 0.99 },
      ] } : category),
    };
    await writeFile(path.join(dataDir, "dashboard-config.json"), JSON.stringify(v2), "utf8");
    await writeFile(path.join(dataDir, "category-learning.json"), "{}", "utf8");
    const loaded = await new ConfigStore(root, dataDir).load();
    expect(loaded.version).toBe(3);
    expect(loaded.analytics.contextSwitchMinimumSeconds).toBe(9);
    expect(loaded.categories.flatMap((category) => category.rules).some((rule) => rule.id === "auto-rule")).toBe(false);
    await expect(access(path.join(dataDir, "category-learning.json"))).rejects.toThrow();
    expect(JSON.parse(await readFile(path.join(dataDir, "dashboard-config.json"), "utf8")).version).toBe(3);
  });

  it("coalesces concurrent first-load requests into one initialization", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "tempo-concurrent-load-")); tempDirs.push(root);
    const dataDir = path.join(root, "Tempo");
    await mkdir(path.join(root, "data"), { recursive: true });
    const legacy = {
      ...DEFAULT_CONFIG,
      version: 1,
      focus: { contextSwitchMinimumSeconds: 5, categoryIds: [], minimumSessionSeconds: 900, bridgeGapSeconds: 120 },
      categories: DEFAULT_CONFIG.categories.map((category) => ({ ...category, rules: category.rules.map(({ id, field, match, pattern, caseSensitive }) => ({ id, field, match, pattern, caseSensitive })) })),
    } as Record<string, unknown>;
    delete legacy.revision; delete legacy.updatedAt; delete legacy.analytics; delete legacy.pomodoro;
    await writeFile(path.join(root, "data", "dashboard-config.json"), JSON.stringify(legacy), "utf8");
    const store = new ConfigStore(root, dataDir);
    const results = await Promise.all(Array.from({ length: 12 }, () => store.load()));
    expect(results.every((config) => config.version === 3 && config.revision === 0)).toBe(true);
    expect(JSON.parse(await readFile(path.join(dataDir, "dashboard-config.json"), "utf8")).version).toBe(3);
  });
});
