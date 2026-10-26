import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AppWindow, Clock3, Globe2, MousePointer2, Timer, X } from "lucide-react";
import { useOutletContext } from "react-router-dom";
import type { BreakdownItem, OverviewResponse } from "@shared/types";
import { groupBreakdown } from "@shared/analytics";
import { ActivityList } from "@/components/ActivityList";
import { Chart, type ChartClickEvent } from "@/components/Chart";
import { donutOption, hourChartOption, rankingOption } from "@/components/charts";
import { EmptyState, ErrorState, LoadingPage, PageHeading, Panel, QualityNotices, StatCard } from "@/components/ui";
import { useLocale } from "@/i18n/locale-context";
import { api } from "@/lib/api";
import { changePercent, formatClock, formatDate, formatDuration } from "@/lib/format";
import type { DashboardOutletContext } from "@/components/DashboardLayout";

export function OverviewPage() {
  const { date, host, refresh } = useOutletContext<DashboardOutletContext>();
  const { t } = useLocale();
  const query = useQuery({ queryKey: ["overview", date, host], queryFn: () => api.overview(date, host), enabled: Boolean(host) });
  if (query.isLoading || !host) return <LoadingPage />;
  if (query.isError) return <ErrorState title={t("activitywatchOffline")} description={t("activitywatchOfflineHint")} onRetry={refresh} />;
  return <OverviewContent data={query.data!} date={date} host={host} />;
}

function OverviewContent({ data, date, host }: { data: OverviewResponse; date: string; host: string }) {
  const { locale, t } = useLocale();
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>();
  const activeChange = changePercent(data.activeSeconds, data.previousActiveSeconds);
  const charts = useMemo(() => ({
    hours: hourChartOption(data.hours, locale),
    categories: donutOption(data.categories, locale),
    apps: rankingOption(data.apps, locale),
    websites: rankingOption(data.websites, locale),
  }), [data.apps, data.categories, data.hours, data.websites, locale]);
  const selectFromChart = (event: ChartClickEvent) => {
    const categoryId = typeof event.data === "object" && event.data !== null && "categoryId" in event.data
      ? String((event.data as { categoryId: unknown }).categoryId)
      : undefined;
    if (categoryId) setSelectedCategoryId(categoryId);
  };

  return <>
    <PageHeading title={t("overview")} description={`${formatDate(date, locale, { dateStyle: "full" })} · ${data.window.dayStart} — ${data.window.dayStart} · ${data.host}`} />
    <QualityNotices codes={data.dataQuality.map((item) => item.code)} />

    <div className="grid gap-4 sm:grid-cols-3">
      <StatCard label={t("activeTime")} value={formatDuration(data.activeSeconds, locale, true)} helper={activeChange === null ? t("noComparison") : t("comparedYesterday")} change={activeChange} icon={<Clock3 size={18} />} />
      <StatCard label={t("contextSwitches")} value={String(data.contextSwitches)} helper={t("app")} icon={<MousePointer2 size={18} />} />
      <StatCard label={t("topApp")} value={data.topApp?.label ?? "—"} helper={data.topApp ? formatDuration(data.topApp.duration, locale) : t("noData")} icon={<AppWindow size={18} />} />
    </div>

    {data.stopwatchSeconds > 0 && <div className="mt-4 card flex items-center gap-3 px-4 py-3 text-sm"><div className="grid h-9 w-9 place-items-center rounded-xl bg-violet-50 text-violet-600"><Timer size={17} /></div><div><div className="font-semibold text-slate-800">{t("stopwatch")}</div><div className="text-xs text-slate-400">{formatDuration(data.stopwatchSeconds, locale)}</div></div></div>}

    {data.activeSeconds === 0 ? <div className="mt-5 card"><EmptyState title={t("noData")} description={t("noDataHint")} /></div> : <div className="mt-5 grid gap-5 xl:grid-cols-12">
      <Panel title={t("hourlyActivity")} className="xl:col-span-7"><Chart option={charts.hours} height={285} /></Panel>
      <Panel title={t("categoryBreakdown")} subtitle={t("categoryBreakdownHint")} className="xl:col-span-5">
        <Chart option={charts.categories} height={285} onClick={selectFromChart} />
        <div className="mt-3 flex max-h-24 flex-wrap gap-1.5 overflow-y-auto" aria-label={t("categoryList")}>
          {data.categories.filter((item) => item.duration > 0).map((item) => <button key={item.key} onClick={() => setSelectedCategoryId(item.key)} className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-600 hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700"><span className="h-2 w-2 rounded-full" style={{ backgroundColor: item.color }} />{item.label}</button>)}
        </div>
      </Panel>
      <Panel title={t("appBreakdown")} className="xl:col-span-7"><Chart option={charts.apps} height={330} /></Panel>
      <Panel title={t("recentActivity")} className="xl:col-span-5"><ActivityList segments={data.recentSegments} limit={8} /></Panel>
      <Panel title={t("websites")} className="xl:col-span-5">{data.websites.length ? <Chart option={charts.websites} height={250} /> : <div className="grid min-h-[250px] place-items-center rounded-xl border border-dashed border-slate-200 bg-slate-50/50 px-5 text-center"><div><AppWindow className="mx-auto text-slate-300" /><p className="mt-3 text-sm font-semibold text-slate-700">{t("websiteWatcherMissing")}</p><p className="mt-1 text-xs leading-5 text-slate-400">{t("installHint")}</p></div></div>}</Panel>
    </div>}

    <CategoryDetailDrawer category={data.categories.find((item) => item.key === selectedCategoryId)} date={date} host={host} onClose={() => setSelectedCategoryId(undefined)} />
  </>;
}

function CategoryDetailDrawer({ category, date, host, onClose }: { category?: BreakdownItem; date: string; host: string; onClose: () => void }) {
  const { locale, t } = useLocale();
  const closeRef = useRef<HTMLButtonElement>(null);
  const [limit, setLimit] = useState(50);
  const timeline = useQuery({ queryKey: ["timeline", date, host], queryFn: () => api.timeline(date, host), enabled: Boolean(category) });
  const segments = useMemo(() => (timeline.data?.segments ?? []).filter((segment) => segment.categoryId === category?.key).sort((a, b) => b.start.localeCompare(a.start)), [category?.key, timeline.data?.segments]);
  const apps = useMemo(() => groupBreakdown(segments, (segment) => segment.app.toLowerCase(), (segment) => segment.appLabel).slice(0, 8), [segments]);
  const websites = useMemo(() => groupBreakdown(segments.filter((segment) => Boolean(segment.domain)), (segment) => segment.domain!, (segment) => segment.domain!).slice(0, 8), [segments]);

  useEffect(() => { setLimit(50); }, [category?.key]);
  useEffect(() => {
    if (!category) return;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const oldOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKeyDown);
    return () => { document.body.style.overflow = oldOverflow; window.removeEventListener("keydown", onKeyDown); previous?.focus(); };
  }, [category, onClose]);

  if (!category) return null;
  const chronological = [...segments].reverse();
  const earliest = chronological[0]?.start;
  const latest = segments[0]?.end;
  return <div className="fixed inset-0 z-50 bg-slate-950/25 backdrop-blur-[1px]" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <aside role="dialog" aria-modal="true" aria-labelledby="category-detail-title" className="ml-auto flex h-full w-full max-w-[640px] flex-col border-l border-slate-200 bg-white shadow-[-20px_0_60px_rgba(15,23,42,.16)]">
      <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4 sm:px-6">
        <div className="min-w-0"><div className="flex items-center gap-2"><span className="h-3 w-3 rounded-full" style={{ backgroundColor: category.color }} /><h2 id="category-detail-title" className="truncate text-lg font-bold text-slate-900">{category.label}</h2></div><p className="mt-1 text-xs text-slate-400">{formatDate(date, locale, { dateStyle: "long" })} · {host}</p></div>
        <button ref={closeRef} onClick={onClose} className="rounded-xl border border-slate-200 p-2 text-slate-500 hover:bg-slate-50" aria-label={t("close")}><X size={18} /></button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-6">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4"><DrawerMetric label={t("duration")} value={formatDuration(category.duration, locale, true)} /><DrawerMetric label={t("categoryShare")} value={`${(category.percent * 100).toFixed(1)}%`} /><DrawerMetric label={t("activitySegments")} value={String(segments.length)} /><DrawerMetric label={t("activityRange")} value={earliest && latest ? `${formatClock(earliest, locale)}–${formatClock(latest, locale)}` : "—"} /></div>
        {timeline.isLoading ? <div className="py-16 text-center text-sm text-slate-400">{t("loadingCategoryDetails")}</div> : timeline.isError ? <ErrorState title={t("categoryDetailsUnavailable")} description={(timeline.error as Error).message} /> : <>
          <div className="mt-6 grid gap-5 sm:grid-cols-2"><RankingList icon={<AppWindow size={15} />} title={t("appBreakdown")} items={apps} /><RankingList icon={<Globe2 size={15} />} title={t("websites")} items={websites} empty={t("noWebsiteRecords")} /></div>
          <div className="mt-7"><div className="mb-3 flex items-end justify-between gap-3"><div><h3 className="text-sm font-bold text-slate-900">{t("activityDetails")}</h3><p className="mt-0.5 text-xs text-slate-400">{t("categoryTitlesOnDemand")}</p></div><span className="text-xs font-semibold text-slate-400">{Math.min(limit, segments.length)} / {segments.length}</span></div><ActivityList segments={segments} limit={limit} />{segments.length > limit && <button className="button-secondary mt-4 w-full" onClick={() => setLimit((current) => current + 50)}>{t("showMore")}</button>}</div>
        </>}
      </div>
    </aside>
  </div>;
}

function DrawerMetric({ label, value }: { label: string; value: string }) { return <div className="rounded-xl border border-slate-100 bg-slate-50 p-3"><div className="text-[11px] font-semibold text-slate-400">{label}</div><div className="mt-1 truncate text-sm font-bold text-slate-800">{value}</div></div>; }

function RankingList({ icon, title, items, empty }: { icon: React.ReactNode; title: string; items: BreakdownItem[]; empty?: string }) {
  const { locale } = useLocale();
  return <section><h3 className="flex items-center gap-2 text-sm font-bold text-slate-900">{icon}{title}</h3><div className="mt-2 space-y-2">{items.length ? items.map((item) => <div key={item.key} className="flex items-center justify-between gap-3 rounded-lg bg-slate-50 px-3 py-2 text-xs"><span className="truncate font-semibold text-slate-600">{item.label}</span><span className="shrink-0 text-slate-400">{formatDuration(item.duration, locale, true)}</span></div>) : <div className="rounded-lg border border-dashed border-slate-200 px-3 py-6 text-center text-xs text-slate-400">{empty ?? "—"}</div>}</div></section>;
}
