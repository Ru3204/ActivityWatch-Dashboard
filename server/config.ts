import { access, readFile, stat, unlink } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { ActivityWatchClient, type ActivityWatchClass } from "./activitywatch";
import { AtomicJsonFile } from "./atomic-json-store";
import { BUILTIN_CATEGORY_TRANSLATIONS, DEFAULT_CONFIG, UNCATEGORIZED_ID } from "../shared/defaults";
import type { ConfigStorageStatus, DashboardCategory, DashboardConfig } from "../shared/types";

const currentRuleSchema = z.object({
  id: z.string().min(1).max(100),
  field: z.enum(["app", "domain", "title"]),
  match: z.enum(["equals", "contains", "regex"]),
  pattern: z.string().min(1).max(240),
  caseSensitive: z.boolean(),
  source: z.enum(["imported", "manual"]),
});

export const categorySchema = z.object({
  id: z.string().min(1).max(80).regex(/^[a-z0-9-]+$/),
  name: z.object({ "zh-CN": z.string().min(1).max(60), en: z.string().min(1).max(60) }),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  rules: z.array(currentRuleSchema).max(200),
});

const analyticsSchema = z.object({
  contextSwitchMinimumSeconds: z.number().int().min(0).max(300),
});


export const configSchema = z.object({
  version: z.literal(3),
  revision: z.number().int().min(0),
  updatedAt: z.string().datetime(),
  locale: z.enum(["zh-CN", "en"]),
  activityWatchUrl: z.string().url().refine(isLocalActivityWatchUrl, "ActivityWatch must use a localhost URL"),
  timezone: z.string().min(1).max(80),
  followActivityWatchDayStart: z.boolean(),
  dayStart: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  refreshSeconds: z.number().int().min(10).max(300),
  selectedHost: z.string().max(120).nullable(),
  analytics: analyticsSchema,
  categories: z.array(categorySchema).min(1).max(60),
}).superRefine(validateConfig);

export const configPatchSchema = z.object({
  expectedRevision: z.number().int().min(0),
  patch: z.object({
    locale: z.enum(["zh-CN", "en"]).optional(),
    activityWatchUrl: z.string().url().refine(isLocalActivityWatchUrl, "ActivityWatch must use a localhost URL").optional(),
    timezone: z.string().min(1).max(80).optional(),
    followActivityWatchDayStart: z.boolean().optional(),
    dayStart: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).optional(),
    refreshSeconds: z.number().int().min(10).max(300).optional(),
    selectedHost: z.string().max(120).nullable().optional(),
    analytics: analyticsSchema.optional(),
  }).strict(),
});

const legacyRuleSchema = z.object({
  id: z.string().min(1),
  field: z.enum(["app", "domain", "title"]),
  match: z.enum(["equals", "contains", "regex"]),
  pattern: z.string(),
  caseSensitive: z.boolean(),
  source: z.enum(["imported", "manual", "auto"]).optional(),
}).passthrough();

const legacyCategorySchema = z.object({
  id: z.string(),
  name: z.object({ "zh-CN": z.string(), en: z.string() }),
  color: z.string(),
  rules: z.array(legacyRuleSchema),
});

const legacyCommonSchema = z.object({
  locale: z.enum(["zh-CN", "en"]),
  activityWatchUrl: z.string(),
  timezone: z.string(),
  followActivityWatchDayStart: z.boolean(),
  dayStart: z.string(),
  refreshSeconds: z.number(),
  selectedHost: z.string().nullable(),
  categories: z.array(legacyCategorySchema),
});

const legacyV1Schema = legacyCommonSchema.extend({
  version: z.literal(1),
  focus: z.object({ contextSwitchMinimumSeconds: z.number().optional() }).passthrough(),
}).passthrough();

const legacyV2Schema = legacyCommonSchema.extend({
  version: z.literal(2),
  revision: z.number().int().min(0),
  updatedAt: z.string().datetime(),
  focus: z.object({ contextSwitchMinimumSeconds: z.number().optional() }).passthrough(),
}).passthrough();

const palette = ["#2563eb", "#7c3aed", "#0891b2", "#059669", "#f59e0b", "#ea580c", "#db2777", "#64748b"];

export class RevisionConflictError extends Error {
  constructor(public readonly current: DashboardConfig) {
    super("The configuration changed in another tab.");
    this.name = "RevisionConflictError";
  }
}

export function resolveDefaultDataDir(projectRoot: string) {
  if (process.env.TEMPO_DATA_DIR) return path.resolve(process.env.TEMPO_DATA_DIR);
  const localAppData = process.env.LOCALAPPDATA;
  return localAppData ? path.join(localAppData, "Tempo") : path.join(projectRoot, "data");
}

/**
 * 迁移是配置边界的一部分，而不是页面组件的职责。这样无论配置来自旧文件、
 * 导入还是备份，进入业务代码前都具有同一种 v3 形状。
 */
export function migrateConfig(input: unknown): DashboardConfig {
  if (typeof input === "object" && input !== null && "version" in input && input.version === 3) {
    return configSchema.parse(input);
  }
  const rawVersion = typeof input === "object" && input !== null && "version" in input ? input.version : undefined;
  const legacy = rawVersion === 2 ? legacyV2Schema.parse(input) : legacyV1Schema.parse(input);
  const contextSwitchMinimumSeconds = legacy.focus.contextSwitchMinimumSeconds ?? DEFAULT_CONFIG.analytics.contextSwitchMinimumSeconds;
  return configSchema.parse({
    locale: legacy.locale,
    activityWatchUrl: legacy.activityWatchUrl,
    timezone: legacy.timezone,
    followActivityWatchDayStart: legacy.followActivityWatchDayStart,
    dayStart: legacy.dayStart,
    refreshSeconds: legacy.refreshSeconds,
    selectedHost: legacy.selectedHost,
    categories: legacy.categories.map((category) => ({
      ...category,
      rules: category.rules
        .filter((rule) => rule.source !== "auto")
        .map((rule) => ({
          id: rule.id,
          field: rule.field,
          match: rule.match,
          pattern: rule.pattern,
          caseSensitive: rule.caseSensitive,
          source: rule.source === "manual" ? "manual" as const : "imported" as const,
        })),
    })),
    version: 3,
    revision: rawVersion === 2 ? legacy.revision : 0,
    updatedAt: rawVersion === 2 ? legacy.updatedAt : new Date().toISOString(),
    analytics: { contextSwitchMinimumSeconds },
  });
}

export class ConfigStore {
  private config: DashboardConfig | null = null;
  private loadPromise: Promise<DashboardConfig> | null = null;
  private writeQueue: Promise<unknown> = Promise.resolve();
  private readonly file: AtomicJsonFile;
  private readonly legacyConfigPath: string;
  private readonly learningPath: string;
  private storage: ConfigStorageStatus;

  constructor(private readonly projectRoot: string, dataDir = resolveDefaultDataDir(projectRoot)) {
    const configPath = path.join(dataDir, "dashboard-config.json");
    this.file = new AtomicJsonFile(configPath, "dashboard-config");
    this.legacyConfigPath = path.join(projectRoot, "data", "dashboard-config.json");
    this.learningPath = path.join(dataDir, "category-learning.json");
    this.storage = { path: configPath, state: "ready", lastSavedAt: null, warning: null };
  }

  getStorageStatus() { return { ...this.storage }; }
  getDataDir() { return path.dirname(this.file.filePath); }

  async load(): Promise<DashboardConfig> {
    if (this.config) return this.config;
    if (this.loadPromise) return this.loadPromise;
    this.loadPromise = this.loadUncached();
    try { return await this.loadPromise; }
    finally { this.loadPromise = null; }
  }

  private async loadUncached(): Promise<DashboardConfig> {
    if (await exists(this.file.filePath)) return this.loadPrimary();
    if (path.resolve(this.legacyConfigPath) !== path.resolve(this.file.filePath) && await exists(this.legacyConfigPath)) {
      try {
        const migrated = await readAndMigrate(this.legacyConfigPath);
        this.config = migrated.config;
        this.storage = { ...this.storage, state: "migrated", warning: "legacy-config-migrated" };
        await this.persist(migrated.config, false);
        if (migrated.wasLegacy) await this.removeLearningState();
        return migrated.config;
      } catch { return this.useMemoryFallback("legacy-config-invalid"); }
    }
    return this.initializeFirstRun();
  }

  async patch(input: z.infer<typeof configPatchSchema>) {
    const parsed = configPatchSchema.parse(input);
    return this.mutate(parsed.expectedRevision, (current) => ({ ...current, ...parsed.patch }));
  }

  async replaceCategories(categories: DashboardCategory[], expectedRevision: number) {
    const parsed = z.array(categorySchema).min(1).max(60).parse(categories);
    return this.mutate(expectedRevision, (current) => ({ ...current, categories: parsed }));
  }

  async import(input: unknown) {
    return this.enqueue(async () => {
      const current = await this.load();
      const imported = migrateConfig(input);
      const next = versioned(imported, current.revision + 1);
      await this.persist(next);
      await this.removeLearningState();
      return next;
    });
  }

  async reset() {
    return this.enqueue(async () => {
      const current = await this.load();
      const next = versioned(structuredClone(DEFAULT_CONFIG), current.revision + 1);
      await this.persist(next);
      await this.removeLearningState();
      return next;
    });
  }

  private async mutate(expectedRevision: number, update: (current: DashboardConfig) => DashboardConfig) {
    return this.enqueue(async () => {
      const current = await this.load();
      if (current.revision !== expectedRevision) throw new RevisionConflictError(current);
      const next = versioned(update(structuredClone(current)), current.revision + 1);
      await this.persist(next);
      return next;
    });
  }

  private enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const queued = this.writeQueue.then(operation, operation);
    this.writeQueue = queued.then(() => undefined, () => undefined);
    return queued;
  }

  private async loadPrimary() {
    try {
      const loaded = JSON.parse(await this.file.readText()) as unknown;
      const wasLegacy = typeof loaded === "object" && loaded !== null && "version" in loaded && loaded.version !== 3;
      const parsed = migrateConfig(loaded);
      this.config = parsed;
      const details = await stat(this.file.filePath);
      this.storage.lastSavedAt = details.mtime.toISOString();
      if (wasLegacy) {
        // 先由 AtomicJsonFile 备份旧文件，迁移失败时用户仍能手动恢复。
        await this.persist(parsed);
        await this.removeLearningState();
        this.storage = { ...this.storage, state: "migrated", warning: "config-migrated-to-v3" };
      }
      return parsed;
    } catch {
      for (const text of await this.file.readBackupTexts()) {
        try {
          const recovered = migrateConfig(JSON.parse(text));
          this.config = recovered;
          this.storage = { ...this.storage, state: "recovered", warning: "config-recovered-from-backup" };
          await this.persist(recovered, false);
          return recovered;
        } catch { /* Keep looking for the newest valid backup. */ }
      }
      return this.useMemoryFallback("config-and-backups-invalid");
    }
  }

  private async useMemoryFallback(warning: string) {
    this.config = versioned(structuredClone(DEFAULT_CONFIG), 0);
    this.storage = { ...this.storage, state: "memory-fallback", warning, lastSavedAt: null };
    return this.config;
  }

  private async initializeFirstRun() {
    const config = structuredClone(DEFAULT_CONFIG);
    try {
      const client = new ActivityWatchClient(config.activityWatchUrl);
      const [settings, info] = await Promise.all([client.getSettings(), client.getInfo()]);
      if (settings.classes?.length) config.categories = importActivityWatchCategories(settings.classes);
      if (settings.startOfDay) config.dayStart = settings.startOfDay;
      config.selectedHost = info.hostname;
    } catch { /* ActivityWatch 离线时，Tempo 仍可先作为番茄钟使用。 */ }
    this.config = versioned(config, 0);
    await this.persist(this.config, false);
    return this.config;
  }

  private async persist(config: DashboardConfig, backupCurrent = true) {
    const parsed = configSchema.parse(config);
    await this.file.write(parsed, backupCurrent);
    this.config = parsed;
    this.storage.lastSavedAt = parsed.updatedAt;
    if (this.storage.state === "memory-fallback") this.storage = { ...this.storage, state: "ready", warning: null };
  }

  private async removeLearningState() {
    try { await unlink(this.learningPath); } catch { /* 已不存在等同于清理成功。 */ }
  }
}

export function importActivityWatchCategories(classes: ActivityWatchClass[]): DashboardCategory[] {
  const categories = classes.map((entry, index) => {
    const parts = Array.isArray(entry.name) ? entry.name : [`Category ${index + 1}`];
    const id = parts.at(-1) === "Uncategorized" ? UNCATEGORIZED_ID : slugify(parts);
    const regex = entry.rule?.regex?.trim();
    return {
      id,
      name: categoryName(parts),
      color: entry.data?.color && /^#[0-9a-fA-F]{3,6}$/.test(entry.data.color) ? expandHex(entry.data.color) : palette[index % palette.length],
      rules: regex ? (["app", "title"] as const).map((field, ruleIndex) => ({
        id: `${id}-rule-${ruleIndex + 1}`,
        field,
        match: "regex" as const,
        pattern: regex,
        caseSensitive: entry.rule?.ignore_case === false,
        source: "imported" as const,
      })) : [],
    };
  });
  if (!categories.some((category) => category.id === UNCATEGORIZED_ID)) categories.push({ id: UNCATEGORIZED_ID, name: categoryName(["Uncategorized"]), color: "#94a3b8", rules: [] });
  return categories;
}

function isLocalActivityWatchUrl(url: string) {
  const parsed = new URL(url);
  return parsed.hostname === "127.0.0.1" || parsed.hostname === "localhost";
}

function validateConfig(config: DashboardConfig, context: z.RefinementCtx) {
  const ids = new Set<string>();
  for (const category of config.categories) {
    if (ids.has(category.id)) context.addIssue({ code: "custom", message: `Duplicate category: ${category.id}` });
    ids.add(category.id);
    for (const rule of category.rules) {
      if (rule.match === "regex") {
        try { new RegExp(rule.pattern, rule.caseSensitive ? "" : "i"); }
        catch { context.addIssue({ code: "custom", message: `Invalid regex: ${rule.pattern}` }); }
      }
    }
  }
  if (!ids.has(UNCATEGORIZED_ID)) context.addIssue({ code: "custom", message: "Uncategorized category is required" });
}

function versioned(config: DashboardConfig, revision: number): DashboardConfig {
  return configSchema.parse({ ...config, version: 3, revision, updatedAt: new Date().toISOString() });
}

async function readAndMigrate(file: string) {
  const input = JSON.parse(await readFile(file, "utf8")) as unknown;
  const wasLegacy = typeof input === "object" && input !== null && "version" in input && input.version !== 3;
  return { config: migrateConfig(input), wasLegacy };
}

async function exists(file: string) {
  try { await access(file); return true; } catch { return false; }
}

function slugify(parts: string[]) {
  const value = parts.join("-").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return value || `category-${Math.random().toString(36).slice(2, 8)}`;
}

function categoryName(parts: string[]) {
  const leaf = parts.at(-1) ?? "Uncategorized";
  return BUILTIN_CATEGORY_TRANSLATIONS[leaf] ?? { "zh-CN": leaf, en: leaf };
}

function expandHex(color: string) {
  if (color.length !== 4) return color;
  return `#${color[1]}${color[1]}${color[2]}${color[2]}${color[3]}${color[3]}`;
}
