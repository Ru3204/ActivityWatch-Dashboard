import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, RotateCcw, Save, Upload } from "lucide-react";
import { useOutletContext } from "react-router-dom";
import type { DashboardConfig } from "@shared/types";
import type { DashboardOutletContext } from "@/components/DashboardLayout";
import { ErrorState, LoadingPage, PageHeading, Panel } from "@/components/ui";
import { useLocale } from "@/i18n/locale-context";
import { api } from "@/lib/api";

export function SettingsPage() {
  const queryClient = useQueryClient();
  const { config: layoutConfig } = useOutletContext<DashboardOutletContext>();
  const { locale, setLocale, t } = useLocale();
  const fileRef = useRef<HTMLInputElement>(null);
  const configQuery = useQuery({ queryKey: ["config"], queryFn: api.config });
  const statusQuery = useQuery({ queryKey: ["status"], queryFn: api.status });
  const [draft, setDraft] = useState<DashboardConfig>();
  const [dirty, setDirty] = useState(false);
  const [message, setMessage] = useState("");
  const [messageSuccess, setMessageSuccess] = useState(false);
  useEffect(() => { if (configQuery.data && !dirty) setDraft(structuredClone(configQuery.data)); }, [configQuery.data, dirty]);
  useEffect(() => {
    const guard = (event: BeforeUnloadEvent) => { if (dirty) { event.preventDefault(); event.returnValue = ""; } };
    const guardLink = (event: MouseEvent) => {
      const anchor = (event.target as Element | null)?.closest("a[href]");
      if (dirty && anchor && !window.confirm(t("discardChangesConfirm"))) { event.preventDefault(); event.stopPropagation(); }
    };
    window.addEventListener("beforeunload", guard);
    document.addEventListener("click", guardLink, true);
    return () => { window.removeEventListener("beforeunload", guard); document.removeEventListener("click", guardLink, true); };
  }, [dirty, t]);
  const saveMutation = useMutation({
    mutationFn: (current: DashboardConfig) => api.patchConfig(current.revision, {
      locale: current.locale,
      activityWatchUrl: current.activityWatchUrl,
      timezone: current.timezone,
      followActivityWatchDayStart: current.followActivityWatchDayStart,
      dayStart: current.dayStart,
      refreshSeconds: current.refreshSeconds,
      selectedHost: current.selectedHost,
      analytics: current.analytics,
    }),
    onSuccess: (saved) => { queryClient.setQueryData(["config"], saved); queryClient.invalidateQueries(); setDraft(saved); setDirty(false); setLocale(saved.locale); setMessageSuccess(true); setMessage(`${t("savedLocally")} · r${saved.revision}`); },
    onError: (error: Error) => { setMessageSuccess(false); setMessage(error.message); },
  });
  const importMutation = useMutation({
    mutationFn: api.importConfig,
    onSuccess: (saved) => { queryClient.setQueryData(["config"], saved); setDraft(saved); setDirty(false); setLocale(saved.locale); setMessageSuccess(true); setMessage(`${t("savedLocally")} · r${saved.revision}`); },
    onError: (error: Error) => { setMessageSuccess(false); setMessage(error.message); },
  });
  const resetMutation = useMutation({
    mutationFn: api.resetConfig,
    onSuccess: (saved) => { queryClient.setQueryData(["config"], saved); setDraft(saved); setDirty(false); setLocale(saved.locale); queryClient.invalidateQueries(); setMessageSuccess(true); setMessage(`${t("savedLocally")} · r${saved.revision}`); },
    onError: (error: Error) => { setMessageSuccess(false); setMessage(error.message); },
  });
  if (configQuery.isLoading || !draft) return <LoadingPage />;
  if (configQuery.isError) return <ErrorState title={t("error")} description={(configQuery.error as Error).message} />;
  const update = <K extends keyof DashboardConfig>(key: K, value: DashboardConfig[K]) => { setDirty(true); setDraft((current) => current ? { ...current, [key]: value } : current); };
  const updateAnalytics = (patch: Partial<DashboardConfig["analytics"]>) => { setDirty(true); setDraft((current) => current ? { ...current, analytics: { ...current.analytics, ...patch } } : current); };

  const importFile = async (file?: File) => {
    if (!file) return;
    try { importMutation.mutate(JSON.parse(await file.text())); }
    catch { setMessageSuccess(false); setMessage(locale === "zh-CN" ? "配置文件不是有效的 JSON。" : "The configuration file is not valid JSON."); }
  };
  const exportConfig = () => {
    const blob = new Blob([`${JSON.stringify(draft, null, 2)}\n`], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a"); link.href = url; link.download = "tempo-config.json"; link.click(); URL.revokeObjectURL(url);
  };
  return (
    <>
      <PageHeading title={t("settings")} description={dirty ? t("unsavedChanges") : t("configLocalOnly")} action={<button className="button-primary" onClick={() => saveMutation.mutate(draft)} disabled={saveMutation.isPending || !dirty}><Save size={15} />{saveMutation.isPending ? t("saving") : t("save")}</button>} />
      {message && <div className={`mb-4 rounded-xl border px-3.5 py-3 text-sm ${messageSuccess ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-rose-200 bg-rose-50 text-rose-700"}`}>{message}</div>}
      {statusQuery.data?.configStorage?.warning && <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-3 text-sm text-amber-800">{t("storageWarning")}: {statusQuery.data.configStorage.warning}</div>}
      <div className="grid gap-5 xl:grid-cols-2">
        <Panel title={t("generalSettings")}>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t("language")}><select className="input" value={draft.locale} onChange={(event) => update("locale", event.target.value as "zh-CN" | "en")}><option value="zh-CN">简体中文</option><option value="en">English</option></select></Field>
            <Field label={t("refreshInterval")}><input className="input" type="number" min={10} max={300} value={draft.refreshSeconds} onChange={(event) => update("refreshSeconds", Number(event.target.value))} /></Field>
            <Field label={t("timezone")}><input className="input" value={draft.timezone} onChange={(event) => update("timezone", event.target.value)} /></Field>
            <Field label={t("dayStart")}><input className="input" type="time" disabled={draft.followActivityWatchDayStart} value={draft.dayStart} onChange={(event) => update("dayStart", event.target.value)} /></Field>
          </div>
          <label className="mt-4 flex items-center gap-2 text-sm font-medium text-slate-600"><input type="checkbox" checked={draft.followActivityWatchDayStart} onChange={(event) => update("followActivityWatchDayStart", event.target.checked)} />{t("followDayStart")}</label>
        </Panel>
        <Panel title={t("dataSource")}>
          <Field label={t("activitywatchUrl")}><input className="input" value={draft.activityWatchUrl} onChange={(event) => update("activityWatchUrl", event.target.value)} /></Field>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <Info label={t("serverVersion")} value={statusQuery.data?.serverVersion ?? "—"} />
            <Info label={t("host")} value={statusQuery.data?.serverHostname ?? layoutConfig?.selectedHost ?? "—"} />
          </div>
          {statusQuery.data?.hosts[0] && <div className="mt-4 flex flex-wrap gap-2">{[["windowTracking", statusQuery.data.hosts[0].window], ["afkTracking", statusQuery.data.hosts[0].afk], ["webTracking", statusQuery.data.hosts[0].web], ["stopwatchTracking", statusQuery.data.hosts[0].stopwatch]].map(([key, available]) => <span key={String(key)} className={`rounded-full px-2.5 py-1 text-xs font-semibold ${available ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-400"}`}>{t(key as any)} · {available ? t("available") : t("unavailable")}</span>)}</div>}
        </Panel>
        <Panel title={t("switchThreshold")}><Field label={t("switchThreshold")}><input className="input" type="number" min={0} max={300} value={draft.analytics.contextSwitchMinimumSeconds} onChange={(event) => updateAnalytics({ contextSwitchMinimumSeconds: Number(event.target.value) })} /></Field></Panel>
        <Panel title={t("configManagement")} className="xl:col-span-2">
          <div className="flex flex-wrap gap-2"><button className="button-secondary" onClick={exportConfig}><Download size={15} />{t("exportConfig")}</button><button className="button-secondary" onClick={() => fileRef.current?.click()}><Upload size={15} />{t("importConfig")}</button><input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={(event) => importFile(event.target.files?.[0])} /><button className="button-danger" onClick={() => window.confirm(t("resetConfirm")) && resetMutation.mutate()}><RotateCcw size={15} />{t("resetConfig")}</button></div>
          <div className="mt-4 rounded-xl bg-slate-50 p-3 text-xs text-slate-500"><div className="font-semibold text-slate-700">{t("configurationPath")}</div><div className="mt-1 break-all">{statusQuery.data?.configStorage?.path ?? "—"}</div><div className="mt-1">revision {draft.revision} · {draft.updatedAt}</div></div>
        </Panel>
      </div>
    </>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="block text-xs font-semibold text-slate-500">{label}<div className="mt-1.5">{children}</div></label>; }
function Info({ label, value }: { label: string; value: string }) { return <div className="rounded-xl border border-slate-100 bg-slate-50/60 p-3"><div className="text-[11px] font-semibold text-slate-400">{label}</div><div className="mt-1 truncate text-sm font-bold text-slate-700">{value}</div></div>; }
