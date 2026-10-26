import type { ActiveSegment } from "@shared/types";
import { useLocale } from "@/i18n/locale-context";
import { formatClock, formatDuration } from "@/lib/format";

export function ActivityList({ segments, limit }: { segments: ActiveSegment[]; limit?: number }) {
  const { locale, t } = useLocale();
  const items = typeof limit === "number" ? segments.slice(0, limit) : segments;
  return (
    <div className="divide-y divide-slate-100">
      {items.map((segment, index) => (
        <div key={`${segment.id}-${segment.start}-${index}`} className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 py-3 first:pt-0 last:pb-0">
          <div className="min-w-0">
            <div className="flex min-w-0 items-center gap-2">
              <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: segment.color }} />
              <span className="truncate text-sm font-semibold text-slate-800">{segment.title || segment.appLabel}</span>
            </div>
            <div className="mt-1 flex min-w-0 items-center gap-2 pl-4 text-[11px] text-slate-400">
              <span className="truncate">{segment.appLabel}</span><span>·</span><span>{segment.categoryName[locale]}</span>
            </div>
          </div>
          <div className="text-right">
            <div className="text-xs font-semibold text-slate-600">{formatDuration(segment.duration, locale, true)}</div>
            <div className="mt-1 text-[11px] text-slate-400">{formatClock(segment.start, locale)}</div>
          </div>
        </div>
      ))}
      {!items.length && <div className="py-8 text-center text-sm text-slate-400">{t("noData")}</div>}
    </div>
  );
}
