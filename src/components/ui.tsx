import { AlertCircle, ArrowDownRight, ArrowUpRight, Inbox, RotateCcw } from "lucide-react";
import type { PropsWithChildren, ReactNode } from "react";
import { useLocale } from "@/i18n/locale-context";

export function PageHeading({ title, description, action }: { title: string; description?: string; action?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="text-[26px] font-bold tracking-[-0.025em] text-slate-950 md:text-[30px]">{title}</h1>
        {description && <p className="mt-1 text-sm leading-6 text-slate-500">{description}</p>}
      </div>
      {action}
    </div>
  );
}

export function Panel({ title, subtitle, action, className = "", children }: PropsWithChildren<{ title: string; subtitle?: string; action?: ReactNode; className?: string }>) {
  return (
    <section className={`card min-w-0 p-4 md:p-5 ${className}`}>
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-[15px] font-bold text-slate-900">{title}</h2>
          {subtitle && <p className="mt-0.5 text-xs leading-5 text-slate-400">{subtitle}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

export function StatCard({ label, value, helper, change, icon }: { label: string; value: string; helper?: string; change?: number | null; icon: ReactNode }) {
  const positive = (change ?? 0) >= 0;
  return (
    <div className="card relative overflow-hidden p-4 md:p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="text-[13px] font-semibold text-slate-500">{label}</div>
        <div className="grid h-9 w-9 place-items-center rounded-xl bg-blue-50 text-blue-600">{icon}</div>
      </div>
      <div className="mt-3 truncate text-[27px] font-bold tracking-[-0.035em] text-slate-950">{value}</div>
      <div className="mt-2 flex min-h-5 items-center gap-1.5 text-xs">
        {change !== null && change !== undefined ? (
          <span className={`inline-flex items-center gap-0.5 font-semibold ${positive ? "text-emerald-600" : "text-rose-600"}`}>
            {positive ? <ArrowUpRight size={13} /> : <ArrowDownRight size={13} />}{Math.abs(change).toFixed(0)}%
          </span>
        ) : null}
        <span className="truncate text-slate-400">{helper}</span>
      </div>
    </div>
  );
}

export function EmptyState({ title, description }: { title: string; description?: string }) {
  return (
    <div className="grid min-h-[220px] place-items-center px-4 text-center">
      <div>
        <div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-slate-100 text-slate-400"><Inbox size={22} /></div>
        <div className="mt-3 text-sm font-bold text-slate-700">{title}</div>
        {description && <p className="mx-auto mt-1 max-w-sm text-xs leading-5 text-slate-400">{description}</p>}
      </div>
    </div>
  );
}

export function ErrorState({ title, description, onRetry }: { title: string; description?: string; onRetry?: () => void }) {
  const { t } = useLocale();
  return (
    <div className="card grid min-h-[360px] place-items-center px-5 text-center">
      <div>
        <div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-rose-50 text-rose-500"><AlertCircle size={22} /></div>
        <h2 className="mt-4 text-lg font-bold text-slate-900">{title}</h2>
        {description && <p className="mx-auto mt-1 max-w-lg text-sm leading-6 text-slate-500">{description}</p>}
        {onRetry && <button onClick={onRetry} className="button-secondary mt-5"><RotateCcw size={15} />{t("retry")}</button>}
      </div>
    </div>
  );
}

export function LoadingPage() {
  return (
    <div className="space-y-5">
      <div className="skeleton h-10 w-52" />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{Array.from({ length: 4 }).map((_, index) => <div key={index} className="skeleton h-36" />)}</div>
      <div className="grid gap-5 xl:grid-cols-2"><div className="skeleton h-[350px]" /><div className="skeleton h-[350px]" /></div>
    </div>
  );
}

export function QualityNotices({ codes }: { codes: string[] }) {
  const { t } = useLocale();
  const messages: Record<string, string> = {
    "missing-afk": t("missingAfk"),
    "partial-afk": t("partialAfk"),
    "missing-window": t("missingWindow"),
  };
  const visible = codes.filter((code) => messages[code]);
  if (!visible.length) return null;
  return (
    <div className="mb-5 space-y-2">
      {visible.map((code) => <div key={code} className="flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-3 text-sm text-amber-900"><AlertCircle size={17} className="mt-0.5 shrink-0 text-amber-600" /><span>{messages[code]}</span></div>)}
    </div>
  );
}
