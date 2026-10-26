import { DateTime } from "luxon";
import { UNCATEGORIZED_ID } from "./defaults";
import type {
  ActiveSegment,
  BreakdownItem,
  DashboardCategory,
  HourBin,
} from "./types";

export function getDayWindow(date: string, timezone: string, dayStart: string) {
  const [hour, minute] = dayStart.split(":").map(Number);
  const base = DateTime.fromISO(date, { zone: timezone }).set({
    hour: hour || 0,
    minute: minute || 0,
    second: 0,
    millisecond: 0,
  });
  if (!base.isValid) throw new Error("Invalid date or timezone");
  const end = base.plus({ days: 1 });
  return {
    start: base.toUTC().toISO()!,
    end: end.toUTC().toISO()!,
    localStart: base,
    localEnd: end,
  };
}

export function prettyAppName(app: string) {
  const withoutExtension = app.replace(/\.(exe|app)$/i, "");
  const aliases: Record<string, string> = {
    chrome: "Chrome",
    msedge: "Microsoft Edge",
    firefox: "Firefox",
    code: "Visual Studio Code",
    explorer: "File Explorer",
    olk: "Outlook",
  };
  const key = withoutExtension.toLowerCase();
  return aliases[key] ?? withoutExtension.replace(/(^|[-_\s])\w/g, (value) => value.toUpperCase());
}

export function findCategory(
  event: Pick<ActiveSegment, "app" | "title" | "domain">,
  categories: DashboardCategory[],
) {
  // 数组顺序就是优先级。用户可以直接看到并调整顺序，比隐藏的“智能权重”更可预测。
  for (const category of categories) {
    if (category.id === UNCATEGORIZED_ID) continue;
    for (const rule of category.rules) {
      if (ruleMatches(event, rule)) return category;
    }
  }
  return categories.find((category) => category.id === UNCATEGORIZED_ID) ?? {
    id: UNCATEGORIZED_ID,
    name: { "zh-CN": "未分类", en: "Uncategorized" },
    color: "#94a3b8",
    rules: [],
  };
}

export function matchingCategoryIds(event: Pick<ActiveSegment, "app" | "title" | "domain">, categories: DashboardCategory[]) {
  return categories.filter((category) => category.id !== UNCATEGORIZED_ID && category.rules.some((rule) => ruleMatches(event, rule))).map((category) => category.id);
}

function ruleMatches(event: Pick<ActiveSegment, "app" | "title" | "domain">, rule: DashboardCategory["rules"][number]) {
  const source = rule.field === "app" ? event.app : rule.field === "domain" ? event.domain ?? "" : event.title;
  try {
    return rule.match === "equals"
      ? rule.caseSensitive ? source === rule.pattern : source.toLocaleLowerCase() === rule.pattern.toLocaleLowerCase()
      : rule.match === "contains"
        ? rule.caseSensitive ? source.includes(rule.pattern) : source.toLocaleLowerCase().includes(rule.pattern.toLocaleLowerCase())
        : new RegExp(rule.pattern, rule.caseSensitive ? "" : "i").test(source);
  } catch {
    return false;
  }
}

export function assignCategories(segments: ActiveSegment[], categories: DashboardCategory[]) {
  return segments.map((segment) => {
    const category = findCategory(segment, categories);
    return {
      ...segment,
      categoryId: category.id,
      categoryName: category.name,
      color: category.color,
    };
  });
}

export function groupBreakdown(
  segments: ActiveSegment[],
  keyFor: (segment: ActiveSegment) => string,
  labelFor: (segment: ActiveSegment) => string,
  colorFor?: (segment: ActiveSegment) => string | undefined,
): BreakdownItem[] {
  const total = segments.reduce((sum, segment) => sum + segment.duration, 0);
  const grouped = new Map<string, BreakdownItem>();
  for (const segment of segments) {
    const key = keyFor(segment);
    const current = grouped.get(key) ?? {
      key,
      label: labelFor(segment),
      duration: 0,
      percent: 0,
      color: colorFor?.(segment),
    };
    current.duration += segment.duration;
    grouped.set(key, current);
  }
  return [...grouped.values()]
    .map((item) => ({ ...item, percent: total ? item.duration / total : 0 }))
    .sort((a, b) => b.duration - a.duration);
}

export function calculateContextSwitches(segments: ActiveSegment[], minimumSeconds: number) {
  const meaningful = [...segments]
    .sort((a, b) => a.start.localeCompare(b.start))
    .filter((segment) => segment.duration >= minimumSeconds);
  let count = 0;
  for (let index = 1; index < meaningful.length; index += 1) {
    if (meaningful[index].app.toLowerCase() !== meaningful[index - 1].app.toLowerCase()) count += 1;
  }
  return count;
}

export function buildHourBins(
  segments: ActiveSegment[],
  windowStart: string,
  timezone: string,
): HourBin[] {
  const localStart = DateTime.fromISO(windowStart, { zone: "utc" }).setZone(timezone);
  const bins: HourBin[] = Array.from({ length: 24 }, (_, index) => ({
    index,
    label: localStart.plus({ hours: index }).toFormat("HH:mm"),
    duration: 0,
  }));

  const hourMs = 3_600_000;
  const startMs = localStart.toMillis();
  const boundaries = bins.map((_, index) => startMs + index * hourMs);
  for (const segment of segments) {
    const segmentStart = DateTime.fromISO(segment.start, { zone: "utc" }).toMillis();
    const segmentEnd = DateTime.fromISO(segment.end, { zone: "utc" }).toMillis();
    for (let index = 0; index < bins.length; index += 1) {
      const overlapStart = Math.max(segmentStart, boundaries[index]);
      const overlapEnd = Math.min(segmentEnd, boundaries[index] + hourMs);
      if (overlapEnd > overlapStart) bins[index].duration += (overlapEnd - overlapStart) / 1000;
    }
  }
  return bins;
}
