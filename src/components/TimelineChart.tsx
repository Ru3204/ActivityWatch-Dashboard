import type { ActiveSegment } from "@shared/types";
import { useLocale } from "@/i18n/locale-context";
import { formatClock, formatDuration } from "@/lib/format";

export function TimelineChart({ segments, start, end }: { segments: ActiveSegment[]; start: string; end: string }) {
  const { locale } = useLocale();
  const startMs = Date.parse(start);
  const totalMs = Math.max(1, Date.parse(end) - startMs);
  const ticks = Array.from({ length: 9 }, (_, index) => ({
    percent: (index / 8) * 100,
    label: formatClock(new Date(startMs + totalMs * index / 8).toISOString(), locale),
  }));
  return (
    <div className="overflow-x-auto pb-1">
      <div className="min-w-[640px]">
        <div className="relative h-20 overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
          {ticks.map((tick) => <div key={tick.percent} className="absolute inset-y-0 border-l border-slate-200/80" style={{ left: `${tick.percent}%` }} />)}
          {segments.map((segment, index) => {
            const left = ((Date.parse(segment.start) - startMs) / totalMs) * 100;
            const width = Math.max(0.12, (segment.duration * 1000 / totalMs) * 100);
            return (
              <div
                key={`${segment.id}-${segment.start}-${index}`}
                className="absolute inset-y-3 rounded-[4px] opacity-85 transition hover:z-10 hover:scale-y-110 hover:opacity-100"
                style={{ left: `${Math.max(0, left)}%`, width: `${Math.min(100 - left, width)}%`, backgroundColor: segment.color }}
                title={`${formatClock(segment.start, locale)} · ${segment.appLabel}\n${segment.title}\n${formatDuration(segment.duration, locale)}`}
              />
            );
          })}
        </div>
        <div className="relative mt-2 h-5 text-[10px] text-slate-400">
          {ticks.map((tick) => <span key={tick.percent} className="absolute -translate-x-1/2" style={{ left: `${tick.percent}%` }}>{tick.label}</span>)}
        </div>
      </div>
    </div>
  );
}
