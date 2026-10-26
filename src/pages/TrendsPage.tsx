import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useOutletContext } from "react-router-dom";
import type { DashboardOutletContext } from "@/components/DashboardLayout";
import { Chart } from "@/components/Chart";
import { categoryTrendOption, heatmapOption, rankingOption, trendOption } from "@/components/charts";
import { EmptyState, ErrorState, LoadingPage, PageHeading, Panel, QualityNotices } from "@/components/ui";
import { useLocale } from "@/i18n/locale-context";
import { api } from "@/lib/api";
import { formatDate, formatDuration } from "@/lib/format";

export function TrendsPage() {
  const { host, refresh } = useOutletContext<DashboardOutletContext>();
  const { locale, t } = useLocale();
  const [days, setDays] = useState(30);
  const query = useQuery({ queryKey: ["trends", days, host], queryFn: () => api.trends(days, host), enabled: Boolean(host) });
  const charts = useMemo(() => query.data ? {
    trend: trendOption(query.data.daily, locale),
    apps: rankingOption(query.data.apps, locale),
    categories: categoryTrendOption(query.data.daily, query.data.categories, locale),
    heatmap: heatmapOption(query.data.weekdayHours, locale),
  } : null, [locale, query.data]);
  if (query.isLoading || !host) return <LoadingPage />;
  if (query.isError) return <ErrorState title={t("activitywatchOffline")} description={t("activitywatchOfflineHint")} onRetry={refresh} />;
  const data = query.data!;
  const activeTotal = data.daily.reduce((sum, day) => sum + day.activeSeconds, 0);
  return (
    <>
      <PageHeading
        title={t("trends")}
        description={`${formatDate(data.range.start, locale)} — ${formatDate(data.range.end, locale)} · ${formatDuration(activeTotal, locale)}`}
        action={<div className="inline-flex rounded-xl border border-slate-200 bg-white p-1">{[7, 30, 90].map((value) => <button key={value} onClick={() => setDays(value)} className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${days === value ? "bg-blue-600 text-white" : "text-slate-500 hover:bg-slate-50"}`}>{value === 7 ? t("sevenDays") : value === 30 ? t("thirtyDays") : t("ninetyDays")}</button>)}</div>}
      />
      <QualityNotices codes={data.dataQuality.map((item) => item.code)} />
      {activeTotal === 0 ? <div className="card"><EmptyState title={t("noData")} description={t("noDataHint")} /></div> : (
        <div className="grid gap-5 xl:grid-cols-12">
          <Panel title={t("activeTime")} className="xl:col-span-8"><Chart option={charts!.trend} height={330} /></Panel>
          <Panel title={t("topAppsInRange")} className="xl:col-span-4"><Chart option={charts!.apps} height={330} /></Panel>
          <Panel title={t("categoryTrend")} className="xl:col-span-7"><Chart option={charts!.categories} height={330} /></Panel>
          <Panel title={t("weekdayHeatmap")} className="xl:col-span-5"><Chart option={charts!.heatmap} height={330} /></Panel>
        </div>
      )}
    </>
  );
}
