import type { DashboardCategory, DashboardConfig, Locale } from "./types";

export const UNCATEGORIZED_ID = "uncategorized";

export const BUILTIN_CATEGORY_TRANSLATIONS: Record<string, Record<Locale, string>> = {
  Work: { "zh-CN": "工作", en: "Work" },
  Programming: { "zh-CN": "编程", en: "Programming" },
  ActivityWatch: { "zh-CN": "ActivityWatch", en: "ActivityWatch" },
  Image: { "zh-CN": "图像", en: "Image" },
  Video: { "zh-CN": "视频", en: "Video" },
  Audio: { "zh-CN": "音频", en: "Audio" },
  "3D": { "zh-CN": "3D", en: "3D" },
  Media: { "zh-CN": "媒体", en: "Media" },
  Games: { "zh-CN": "游戏", en: "Games" },
  "Social Media": { "zh-CN": "社交媒体", en: "Social Media" },
  Music: { "zh-CN": "音乐", en: "Music" },
  Comms: { "zh-CN": "沟通", en: "Comms" },
  IM: { "zh-CN": "即时通讯", en: "IM" },
  Email: { "zh-CN": "邮件", en: "Email" },
  Uncategorized: { "zh-CN": "未分类", en: "Uncategorized" },
};

export const FALLBACK_CATEGORIES: DashboardCategory[] = [
  {
    id: "work",
    name: { "zh-CN": "工作", en: "Work" },
    color: "#2563eb",
    rules: [
      { id: "work-code", field: "app", match: "regex", pattern: "code|idea|pycharm|studio|vim|terminal|powershell", caseSensitive: false, source: "manual" },
      { id: "work-docs", field: "title", match: "regex", pattern: "docs|office|notion|figma|github|gitlab", caseSensitive: false, source: "manual" },
    ],
  },
  {
    id: "communication",
    name: { "zh-CN": "沟通", en: "Communication" },
    color: "#7c3aed",
    rules: [
      { id: "comms-apps", field: "app", match: "regex", pattern: "teams|slack|discord|outlook|olk", caseSensitive: false, source: "manual" },
    ],
  },
  {
    id: "media",
    name: { "zh-CN": "媒体", en: "Media" },
    color: "#f59e0b",
    rules: [
      { id: "media-title", field: "title", match: "regex", pattern: "youtube|netflix|spotify|twitch", caseSensitive: false, source: "manual" },
    ],
  },
  {
    id: UNCATEGORIZED_ID,
    name: { "zh-CN": "未分类", en: "Uncategorized" },
    color: "#94a3b8",
    rules: [],
  },
];

export const DEFAULT_CONFIG: DashboardConfig = {
  version: 3,
  revision: 0,
  updatedAt: new Date(0).toISOString(),
  locale: "zh-CN",
  activityWatchUrl: "http://127.0.0.1:5600",
  timezone: "Australia/Sydney",
  followActivityWatchDayStart: true,
  dayStart: "04:00",
  refreshSeconds: 30,
  selectedHost: null,
  analytics: {
    contextSwitchMinimumSeconds: 5,
  },
  categories: FALLBACK_CATEGORIES,
};
