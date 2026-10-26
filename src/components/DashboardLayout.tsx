import { useCallback, useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  BarChart3,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Clock3,
  FolderKanban,
  Gauge,
  Languages,
  RefreshCw,
  Settings2,
  Wifi,
  WifiOff,
} from "lucide-react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import type { DashboardConfig } from "@shared/types";
import { api } from "@/lib/api";
import { useLocale } from "@/i18n/locale-context";

export interface DashboardOutletContext {
  date: string;
  host?: string;
  config?: DashboardConfig;
  connected: boolean;
  refresh: () => void;
}

const navItems = [
  { to: "/overview", key: "overview" as const, icon: Gauge },
  { to: "/timeline", key: "timeline" as const, icon: Clock3 },
  { to: "/trends", key: "trends" as const, icon: BarChart3 },
  { to: "/categories", key: "categories" as const, icon: FolderKanban },
  { to: "/settings", key: "settings" as const, icon: Settings2 },
];

export function DashboardLayout() {
  const queryClient = useQueryClient();
  const location = useLocation();
  const { locale, setLocale, t } = useLocale();
  const [date, setDate] = useState(todayInSydney());
  const [host, setHost] = useState<string>();
  const configQuery = useQuery({ queryKey: ["config"], queryFn: api.config });
  const statusQuery = useQuery({ queryKey: ["status"], queryFn: api.status, refetchInterval: 30_000 });
  const configMutation = useMutation({
    mutationFn: ({ expectedRevision, locale }: { expectedRevision: number; locale: "zh-CN" | "en" }) => api.patchConfig(expectedRevision, { locale }),
    onSuccess: (config) => queryClient.setQueryData(["config"], config),
    onError: () => queryClient.invalidateQueries({ queryKey: ["config"] }),
  });

  useEffect(() => {
    if (!host && statusQuery.data?.hosts.length) {
      const preferred = configQuery.data?.selectedHost;
      setHost(statusQuery.data.hosts.some((item) => item.host === preferred) ? preferred! : statusQuery.data.hosts[0].host);
    }
  }, [configQuery.data?.selectedHost, host, statusQuery.data?.hosts]);

  useEffect(() => {
    if (configQuery.data?.locale && localStorage.getItem("tempo-locale") === null) setLocale(configQuery.data.locale);
  }, [configQuery.data?.locale, setLocale]);

  const refresh = useCallback(() => {
    void queryClient.invalidateQueries({ predicate: (query) => ["status", "overview", "timeline", "trends"].includes(String(query.queryKey[0])) });
  }, [queryClient]);
  const shiftDate = (days: number) => {
    const next = new Date(`${date}T12:00:00`);
    next.setDate(next.getDate() + days);
    setDate(toIsoDate(next));
  };
  const switchLocale = () => {
    const next = locale === "zh-CN" ? "en" : "zh-CN";
    setLocale(next);
    if (configQuery.data) configMutation.mutate({ expectedRevision: configQuery.data.revision, locale: next });
  };
  const context = useMemo<DashboardOutletContext>(() => ({
    date,
    host,
    config: configQuery.data,
    connected: statusQuery.data?.connected ?? false,
    refresh,
  }), [configQuery.data, date, host, refresh, statusQuery.data?.connected]);

  return (
    <div className="min-h-screen bg-[#f5f7fb]">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[248px] border-r border-[#e6e9ef] bg-white px-4 py-6 lg:flex lg:flex-col">
        <div className="flex items-center gap-3 px-2">
          <div className="grid h-10 w-10 place-items-center rounded-[13px] bg-blue-600 text-white shadow-[0_8px_24px_rgba(37,99,235,.22)]">
            <Clock3 size={20} strokeWidth={2.3} />
          </div>
          <div>
            <div className="text-[17px] font-bold tracking-tight text-slate-900">Tempo</div>
            <div className="text-[11px] font-medium text-slate-400">{t("brandSubtitle")}</div>
          </div>
        </div>

        <nav className="mt-9 space-y-1.5">
          {navItems.map(({ to, key, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) => `flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition ${isActive ? "bg-blue-50 text-blue-700" : "text-slate-500 hover:bg-slate-50 hover:text-slate-900"}`}
            >
              <Icon size={18} strokeWidth={2} />
              {t(key)}
            </NavLink>
          ))}
        </nav>


        <div className="mt-auto rounded-2xl border border-slate-200 bg-slate-50/70 p-3.5">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-700">
            {statusQuery.data?.connected ? <Wifi size={16} className="text-emerald-500" /> : <WifiOff size={16} className="text-rose-500" />}
            {statusQuery.data?.connected ? t("connected") : t("offline")}
          </div>
          <div className="mt-1.5 truncate text-xs text-slate-400">
            {statusQuery.data?.connected ? `${statusQuery.data.serverVersion} · ${host ?? "—"}` : "127.0.0.1:5600"}
          </div>
        </div>
      </aside>

      <div className="lg:pl-[248px]">
        <header className="sticky top-0 z-20 border-b border-[#e6e9ef] bg-white/90 backdrop-blur-xl">
          <div className="flex min-h-[72px] flex-wrap items-center gap-3 px-4 py-3 md:px-7 xl:px-9">
            <div className="mr-auto flex items-center gap-3 lg:hidden">
              <div className="grid h-9 w-9 place-items-center rounded-xl bg-blue-600 text-white"><Clock3 size={18} /></div>
              <span className="font-bold text-slate-900">Tempo</span>
            </div>

            {!location.pathname.includes("categories") && !location.pathname.includes("settings") && (
              <div className="flex items-center rounded-xl border border-slate-200 bg-white p-1 shadow-sm">
                <button aria-label="Previous day" onClick={() => shiftDate(-1)} className="rounded-lg p-2 text-slate-400 hover:bg-slate-50 hover:text-slate-700"><ChevronLeft size={16} /></button>
                <label className="relative flex items-center gap-2 px-1.5 text-sm font-semibold text-slate-700">
                  <CalendarDays size={16} className="text-blue-600" />
                  <input type="date" value={date} max={todayInSydney()} onChange={(event) => setDate(event.target.value)} className="w-[126px] bg-transparent outline-none" />
                </label>
                <button aria-label="Next day" disabled={date >= todayInSydney()} onClick={() => shiftDate(1)} className="rounded-lg p-2 text-slate-400 hover:bg-slate-50 hover:text-slate-700 disabled:opacity-30"><ChevronRight size={16} /></button>
                {date !== todayInSydney() && <button onClick={() => setDate(todayInSydney())} className="mr-1 rounded-lg bg-blue-50 px-2 py-1 text-xs font-semibold text-blue-700">{t("today")}</button>}
              </div>
            )}


            {statusQuery.data?.hosts && statusQuery.data.hosts.length > 1 && (
              <select aria-label={t("host")} value={host} onChange={(event) => setHost(event.target.value)} className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-600 outline-none">
                {statusQuery.data.hosts.map((item) => <option key={item.host}>{item.host}</option>)}
              </select>
            )}

            <button onClick={switchLocale} className="button-secondary h-10 min-h-0 px-3" title={t("language")} aria-label={t("language")}>
              <Languages size={16} /> {locale === "zh-CN" ? "EN" : "中文"}
            </button>
            <button onClick={refresh} className="button-secondary h-10 min-h-0 px-3" title={t("refresh")}>
              <RefreshCw size={16} className={statusQuery.isFetching ? "animate-spin" : ""} />
              <span className="hidden sm:inline">{t("refresh")}</span>
            </button>
          </div>
        </header>

        <main className="mx-auto max-w-[1560px] px-4 py-6 pb-24 md:px-7 md:py-8 lg:pb-8 xl:px-9">
          <Outlet context={context} />
        </main>
      </div>

      <nav className="fixed inset-x-3 bottom-3 z-30 flex items-center justify-around rounded-2xl border border-slate-200 bg-white/95 p-1.5 shadow-[0_12px_40px_rgba(15,23,42,.14)] backdrop-blur lg:hidden">
        {navItems.map(({ to, key, icon: Icon }) => (
          <NavLink key={to} to={to} className={({ isActive }) => `flex min-w-[54px] flex-col items-center gap-1 rounded-xl px-2 py-2 text-[10px] font-semibold ${isActive ? "bg-blue-50 text-blue-700" : "text-slate-400"}`}>
            <Icon size={18} /><span className="max-w-[64px] truncate">{t(key)}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  );
}

function todayInSydney() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Australia/Sydney", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

function toIsoDate(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
