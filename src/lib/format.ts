import type { Locale } from "@shared/types";

export function formatDuration(seconds: number, locale: Locale, compact = false) {
  const safe = Math.max(0, Math.round(seconds));
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  if (compact) return hours ? `${hours}h ${minutes}m` : `${minutes}m`;
  if (locale === "zh-CN") return hours ? `${hours} 小时 ${minutes} 分钟` : `${minutes} 分钟`;
  return hours ? `${hours} hr ${minutes} min` : `${minutes} min`;
}

export function formatClock(iso: string, locale: Locale) {
  return new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
}

export function formatDate(isoDate: string, locale: Locale, options?: Intl.DateTimeFormatOptions) {
  return new Intl.DateTimeFormat(locale, options ?? { month: "short", day: "numeric", weekday: "short" })
    .format(new Date(`${isoDate}T12:00:00`));
}

export function changePercent(current: number, previous: number) {
  if (!previous) return null;
  return ((current - previous) / previous) * 100;
}

