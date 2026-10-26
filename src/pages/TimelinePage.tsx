import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search } from "lucide-react";
import { useOutletContext } from "react-router-dom";
import type { DashboardOutletContext } from "@/components/DashboardLayout";
import { TimelineChart } from "@/components/TimelineChart";
import { EmptyState, ErrorState, LoadingPage, PageHeading, Panel, QualityNotices } from "@/components/ui";
import { useLocale } from "@/i18n/locale-context";
import { api } from "@/lib/api";
import { formatClock, formatDate, formatDuration } from "@/lib/format";

export function TimelinePage() {
  const { date, host, refresh } = useOutletContext<DashboardOutletContext>();
  const { locale, t } = useLocale();
  const [search, setSearch] = useState("");
  const query = useQuery({ queryKey: ["timeline", date, host], queryFn: () => api.timeline(date, host), enabled: Boolean(host) });
  const segments = useMemo(() => {
    const value = query.data?.segments ?? [];
    const term = search.trim().toLocaleLowerCase();
    return term ? value.filter((segment) => `${segment.app} ${segment.title} ${segment.categoryName[locale]}`.toLocaleLowerCase().includes(term)) : value;
  }, [locale, query.data?.segments, search]);
  if (query.isLoading || !host) return <LoadingPage />;
  if (query.isError) return <ErrorState title={t("activitywatchOffline")} description={t("activitywatchOfflineHint")} onRetry={refresh} />;
  const data = query.data!;
  return (
    <>
      <PageHeading title={t("timeline")} description={`${formatDate(date, locale, { dateStyle: "full" })} · ${t("timelineHint")}`} />
      <QualityNotices codes={data.dataQuality.map((item) => item.code)} />
      <Panel title={t("fullTimeline")} subtitle={`${data.segments.length} ${t("segments")}`}>
        {data.segments.length ? <TimelineChart segments={data.segments} start={data.window.start} end={data.window.end} /> : <EmptyState title={t("noData")} description={t("noDataHint")} />}
      </Panel>
      <Panel title={t("activityDetails")} className="mt-5" action={<label className="relative block w-full max-w-[260px]"><Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={t("title")} className="input h-9 py-1.5 pl-9 text-xs" /></label>}>
        {segments.length ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] border-collapse text-left">
              <thead><tr className="border-b border-slate-200 text-[11px] font-semibold uppercase tracking-wide text-slate-400"><th className="pb-3 pr-4">{t("startedAt")}</th><th className="pb-3 pr-4">{t("app")}</th><th className="pb-3 pr-4">{t("title")}</th><th className="pb-3 pr-4">{t("category")}</th><th className="pb-3 text-right">{t("duration")}</th></tr></thead>
              <tbody className="divide-y divide-slate-100">
                {segments.map((segment, index) => <tr key={`${segment.id}-${segment.start}-${index}`} className="text-sm text-slate-600 hover:bg-slate-50/70"><td className="py-3 pr-4 text-xs font-medium text-slate-400">{formatClock(segment.start, locale)}</td><td className="py-3 pr-4 font-semibold text-slate-700">{segment.appLabel}</td><td className="max-w-[480px] py-3 pr-4"><span className="line-clamp-2" title={segment.title}>{segment.title || "—"}</span></td><td className="py-3 pr-4"><span className="inline-flex items-center gap-1.5 rounded-full bg-slate-50 px-2 py-1 text-xs"><span className="h-2 w-2 rounded-full" style={{ backgroundColor: segment.color }} />{segment.categoryName[locale]}</span></td><td className="py-3 text-right text-xs font-semibold text-slate-500">{formatDuration(segment.duration, locale, true)}</td></tr>)}
              </tbody>
            </table>
          </div>
        ) : <EmptyState title={t("noData")} />}
      </Panel>
    </>
  );
}
