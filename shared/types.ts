export type Locale = "zh-CN" | "en";
export type RuleField = "app" | "domain" | "title";
export type RuleMatch = "equals" | "contains" | "regex";
export type RuleSource = "imported" | "manual";

export interface CategoryRule {
  id: string;
  field: RuleField;
  match: RuleMatch;
  pattern: string;
  caseSensitive: boolean;
  source: RuleSource;
}

export interface DashboardCategory {
  id: string;
  name: Record<Locale, string>;
  color: string;
  rules: CategoryRule[];
}

export interface AnalyticsSettings {
  contextSwitchMinimumSeconds: number;
}


export interface DashboardConfig {
  version: 3;
  revision: number;
  updatedAt: string;
  locale: Locale;
  activityWatchUrl: string;
  timezone: string;
  followActivityWatchDayStart: boolean;
  dayStart: string;
  refreshSeconds: number;
  selectedHost: string | null;
  analytics: AnalyticsSettings;
  categories: DashboardCategory[];
}

export interface ConfigStorageStatus {
  path: string;
  state: "ready" | "migrated" | "recovered" | "memory-fallback";
  lastSavedAt: string | null;
  warning: string | null;
}

export interface ActivityWatchBucket {
  id: string;
  type: string;
  client: string;
  hostname: string;
  created: string;
}

export interface ActivityWatchEvent {
  id: number | null;
  timestamp: string;
  duration: number;
  data: Record<string, unknown>;
}

export interface HostCapabilities {
  host: string;
  window: boolean;
  afk: boolean;
  stopwatch: boolean;
  web: boolean;
}

export interface StatusResponse {
  connected: boolean;
  serverVersion: string | null;
  serverHostname: string | null;
  hosts: HostCapabilities[];
  dayStart: string;
  warnings: string[];
  checkedAt: string;
  configStorage?: ConfigStorageStatus;
}

export interface ActiveSegment {
  id: string;
  start: string;
  end: string;
  duration: number;
  app: string;
  appLabel: string;
  title: string;
  categoryId: string;
  categoryName: Record<Locale, string>;
  color: string;
  url?: string;
  domain?: string;
  domainCoverage?: number;
}

export interface BreakdownItem {
  key: string;
  label: string;
  duration: number;
  percent: number;
  color?: string;
}

export interface HourBin {
  index: number;
  label: string;
  duration: number;
}

export interface DataQuality {
  code: "missing-window" | "missing-afk" | "missing-web" | "empty-range" | "partial-afk";
  severity: "info" | "warning";
}

export interface OverviewResponse {
  date: string;
  host: string;
  window: { start: string; end: string; dayStart: string; timezone: string };
  activeSeconds: number;
  previousActiveSeconds: number;
  contextSwitches: number;
  stopwatchSeconds: number;
  topApp: BreakdownItem | null;
  apps: BreakdownItem[];
  categories: BreakdownItem[];
  websites: BreakdownItem[];
  hours: HourBin[];
  recentSegments: ActiveSegment[];
  dataQuality: DataQuality[];
  generatedAt: string;
}

export interface TimelineResponse {
  date: string;
  host: string;
  window: { start: string; end: string; dayStart: string; timezone: string };
  segments: ActiveSegment[];
  dataQuality: DataQuality[];
}

export interface TrendDay {
  date: string;
  activeSeconds: number;
  contextSwitches: number;
  categories: Record<string, number>;
}

export interface TrendsResponse {
  host: string;
  days: number;
  range: { start: string; end: string };
  daily: TrendDay[];
  apps: BreakdownItem[];
  categories: BreakdownItem[];
  weekdayHours: Array<{ weekday: number; hour: number; duration: number }>;
  dataQuality: DataQuality[];
  generatedAt: string;
}

export interface CategoryPreviewResponse {
  totalSegments: number;
  matchedSegments: number;
  newlyMatchedSegments: number;
  lostMatchedSegments: number;
  changedCategorySegments: number;
  conflictingSegments: number;
  unmatchedSegments: number;
  breakdown: BreakdownItem[];
  examples: Array<{ app: string; title: string; categoryId: string }>;
}

