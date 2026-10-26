import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, Eye, Plus, Save, Trash2 } from "lucide-react";
import { useOutletContext } from "react-router-dom";
import type { DashboardCategory, DashboardConfig } from "@shared/types";
import type { DashboardOutletContext } from "@/components/DashboardLayout";
import { EmptyState, ErrorState, LoadingPage, PageHeading, Panel } from "@/components/ui";
import { useLocale } from "@/i18n/locale-context";
import { ApiError, api } from "@/lib/api";
import { formatDuration } from "@/lib/format";

export function CategoriesPage() {
  const queryClient = useQueryClient();
  const { date, host } = useOutletContext<DashboardOutletContext>();
  const { locale, t } = useLocale();
  const configQuery = useQuery({ queryKey: ["config"], queryFn: api.config });
  const [categories, setCategories] = useState<DashboardCategory[]>([]);
  const [baseRevision, setBaseRevision] = useState(0);
  const [dirty, setDirty] = useState(false);
  const [message, setMessage] = useState("");
  const [messageSuccess, setMessageSuccess] = useState(false);
  const [conflict, setConflict] = useState<DashboardConfig>();

  useEffect(() => {
    if (!configQuery.data || dirty) return;
    setCategories(structuredClone(configQuery.data.categories));
    setBaseRevision(configQuery.data.revision);
  }, [configQuery.data, dirty]);
  useEffect(() => {
    const guard = (event: BeforeUnloadEvent) => { if (dirty) { event.preventDefault(); event.returnValue = ""; } };
    const guardLink = (event: MouseEvent) => {
      const anchor = (event.target as Element | null)?.closest("a[href]");
      if (dirty && anchor && !window.confirm(t("discardChangesConfirm"))) { event.preventDefault(); event.stopPropagation(); }
    };
    window.addEventListener("beforeunload", guard); document.addEventListener("click", guardLink, true);
    return () => { window.removeEventListener("beforeunload", guard); document.removeEventListener("click", guardLink, true); };
  }, [dirty, t]);

  const saveMutation = useMutation({
    mutationFn: () => api.saveCategories(baseRevision, categories),
    onSuccess: (saved) => {
      queryClient.setQueryData(["config"], saved);
      queryClient.invalidateQueries({ predicate: (query) => ["overview", "timeline", "trends"].includes(String(query.queryKey[0])) });
      setCategories(structuredClone(saved.categories)); setBaseRevision(saved.revision); setDirty(false); setConflict(undefined);
      setMessageSuccess(true); setMessage(`${t("savedLocally")} · r${saved.revision}`);
    },
    onError: (error: Error) => {
      if (error instanceof ApiError && error.status === 409 && error.current) setConflict(error.current);
      setMessageSuccess(false); setMessage(error.message);
    },
  });
  const previewMutation = useMutation({ mutationFn: () => api.previewCategories(date, categories, host), onError: (error: Error) => { setMessageSuccess(false); setMessage(error.message); } });

  if (configQuery.isLoading || !configQuery.data) return <LoadingPage />;
  if (configQuery.isError) return <ErrorState title={t("error")} description={(configQuery.error as Error).message} />;
  const markChanged = (next: DashboardCategory[]) => { setCategories(next); setDirty(true); setMessage(""); };
  const updateCategory = (index: number, patch: Partial<DashboardCategory>) => markChanged(categories.map((category, categoryIndex) => categoryIndex === index ? { ...category, ...patch } : category));
  const moveCategory = (index: number, offset: number) => {
    const target = index + offset;
    if (target < 0 || target >= categories.length || categories[index].id === "uncategorized" || categories[target].id === "uncategorized") return;
    const next = [...categories]; [next[index], next[target]] = [next[target], next[index]]; markChanged(next);
  };
  const addCategory = () => {
    const id = `custom-${Date.now().toString(36)}`;
    markChanged([...categories.slice(0, -1), { id, name: { "zh-CN": "新分类", en: "New category" }, color: "#0ea5e9", rules: [] }, ...categories.slice(-1)]);
  };

  return <>
    <PageHeading title={t("editCategories")} description={dirty ? t("unsavedChanges") : t("manualRulesHint")} action={<div className="flex gap-2"><button className="button-secondary" onClick={() => previewMutation.mutate()} disabled={previewMutation.isPending}><Eye size={15} />{t("preview")}</button><button className="button-primary" onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending || !dirty}><Save size={15} />{saveMutation.isPending ? t("saving") : t("save")}</button></div>} />
    {message && <div className={`mb-4 rounded-xl border px-3.5 py-3 text-sm ${messageSuccess ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-rose-200 bg-rose-50 text-rose-700"}`}>{message}</div>}
    {conflict && <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"><div className="font-semibold">{t("revisionConflict")}</div><p className="mt-1 text-xs leading-5">{t("manualConflictHint")}</p><div className="mt-3 flex flex-wrap gap-2"><button className="button-secondary" onClick={() => { setCategories(structuredClone(conflict.categories)); setBaseRevision(conflict.revision); setDirty(false); setConflict(undefined); queryClient.setQueryData(["config"], conflict); }}>{t("loadLatest")}</button><button className="button-primary" onClick={() => { setBaseRevision(conflict.revision); setConflict(undefined); setDirty(true); }}>{t("keepDraft")}</button></div></div>}

    <div className="space-y-4">{categories.map((category, categoryIndex) => <Panel key={category.id} title={category.name[locale]} action={<div className="flex items-center gap-1"><button aria-label={t("moveUp")} onClick={() => moveCategory(categoryIndex, -1)} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100"><ArrowUp size={14} /></button><button aria-label={t("moveDown")} onClick={() => moveCategory(categoryIndex, 1)} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100"><ArrowDown size={14} /></button>{category.id !== "uncategorized" && <button aria-label={t("delete")} onClick={() => markChanged(categories.filter((item) => item.id !== category.id))} className="rounded-lg p-2 text-slate-400 hover:bg-rose-50 hover:text-rose-500"><Trash2 size={15} /></button>}</div>}>
      <div className="grid gap-3 md:grid-cols-[1fr_1fr_110px]"><label className="text-xs font-semibold text-slate-500">{t("nameZh")}<input className="input mt-1.5" value={category.name["zh-CN"]} onChange={(event) => updateCategory(categoryIndex, { name: { ...category.name, "zh-CN": event.target.value } })} /></label><label className="text-xs font-semibold text-slate-500">{t("nameEn")}<input className="input mt-1.5" value={category.name.en} onChange={(event) => updateCategory(categoryIndex, { name: { ...category.name, en: event.target.value } })} /></label><label className="text-xs font-semibold text-slate-500">{t("color")}<div className="mt-1.5 flex h-[43px] items-center gap-2 rounded-xl border border-slate-200 px-2"><input type="color" className="h-7 w-8 border-0 bg-transparent p-0" value={category.color} onChange={(event) => updateCategory(categoryIndex, { color: event.target.value })} /><span className="text-xs text-slate-400">{category.color}</span></div></label></div>
      {category.id !== "uncategorized" && <div className="mt-4 space-y-2">{category.rules.map((_, ruleIndex) => <RuleEditor key={category.rules[ruleIndex].id} category={category} ruleIndex={ruleIndex} onChange={(rules) => updateCategory(categoryIndex, { rules })} t={t} />)}<button className="button-secondary" onClick={() => updateCategory(categoryIndex, { rules: [...category.rules, { id: `${category.id}-${Date.now()}`, field: "title", match: "contains", pattern: "new rule", caseSensitive: false, source: "manual" }] })}><Plus size={14} />{t("addRule")}</button></div>}
    </Panel>)}<button className="button-secondary" onClick={addCategory}><Plus size={15} />{t("addCategory")}</button></div>

    {previewMutation.data && <Panel title={t("previewResult")} className="mt-5" subtitle={`${t("matched")} ${previewMutation.data.matchedSegments} / ${previewMutation.data.totalSegments} ${t("segments")}`}><div className="mb-4 grid gap-2 sm:grid-cols-5"><Metric label={t("newlyMatched")} value={String(previewMutation.data.newlyMatchedSegments)} /><Metric label={t("lostMatches")} value={String(previewMutation.data.lostMatchedSegments)} /><Metric label={t("changedCategories")} value={String(previewMutation.data.changedCategorySegments)} /><Metric label={t("ruleConflicts")} value={String(previewMutation.data.conflictingSegments)} /><Metric label={t("stillUncategorized")} value={String(previewMutation.data.unmatchedSegments)} /></div>{previewMutation.data.breakdown.length ? <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{previewMutation.data.breakdown.map((item) => <div key={item.key} className="rounded-xl border border-slate-100 bg-slate-50/60 p-3"><div className="flex items-center gap-2 text-sm font-semibold text-slate-700"><span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: item.color }} />{item.label}</div><div className="mt-2 text-xl font-bold text-slate-900">{formatDuration(item.duration, locale, true)}</div><div className="text-xs text-slate-400">{(item.percent * 100).toFixed(1)}%</div></div>)}</div> : <EmptyState title={t("noData")} />}</Panel>}
  </>;
}

function RuleEditor({ category, ruleIndex, onChange, t }: { category: DashboardCategory; ruleIndex: number; onChange: (rules: DashboardCategory["rules"]) => void; t: (key: any) => string }) {
  const rule = category.rules[ruleIndex];
  const update = (patch: Partial<typeof rule>) => onChange(category.rules.map((item, index) => index === ruleIndex ? { ...item, ...patch, source: "manual" } : item));
  const invalidRegex = useMemo(() => { if (rule.match !== "regex") return false; try { new RegExp(rule.pattern); return false; } catch { return true; } }, [rule.match, rule.pattern]);
  const move = (offset: number) => { const target = ruleIndex + offset; if (target < 0 || target >= category.rules.length) return; const next = [...category.rules]; [next[ruleIndex], next[target]] = [next[target], next[ruleIndex]]; onChange(next); };
  return <div className={`grid gap-2 rounded-xl border p-2.5 md:grid-cols-[100px_120px_minmax(180px,1fr)_100px_82px] ${invalidRegex ? "border-rose-300 bg-rose-50" : "border-slate-100 bg-slate-50/60"}`}><select className="input py-2 text-xs" value={rule.field} onChange={(event) => update({ field: event.target.value as typeof rule.field })}><option value="app">{t("app")}</option><option value="domain">{t("domain")}</option><option value="title">{t("title")}</option></select><select className="input py-2 text-xs" value={rule.match} onChange={(event) => update({ match: event.target.value as typeof rule.match })}><option value="equals">{t("equals")}</option><option value="contains">{t("contains")}</option><option value="regex">{t("regex")}</option></select><div><input className="input py-2 text-xs" value={rule.pattern} onChange={(event) => update({ pattern: event.target.value })} />{invalidRegex && <div className="mt-1 text-[11px] text-rose-600">{t("invalidRegex")}</div>}</div><span className="self-center rounded-full bg-slate-100 px-2 py-1 text-center text-[10px] font-semibold text-slate-500">{t(rule.source === "imported" ? "imported" : "manual")}</span><div className="flex items-center justify-end gap-1"><button onClick={() => move(-1)} className="rounded p-1.5 text-slate-400 hover:bg-white"><ArrowUp size={13} /></button><button onClick={() => move(1)} className="rounded p-1.5 text-slate-400 hover:bg-white"><ArrowDown size={13} /></button><button onClick={() => onChange(category.rules.filter((_, index) => index !== ruleIndex))} className="rounded p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-500"><Trash2 size={13} /></button></div></div>;
}

function Metric({ label, value }: { label: string; value: string }) { return <div className="rounded-xl border border-slate-100 bg-slate-50/70 p-3"><div className="text-[11px] font-semibold text-slate-400">{label}</div><div className="mt-1 text-lg font-bold text-slate-800">{value}</div></div>; }
