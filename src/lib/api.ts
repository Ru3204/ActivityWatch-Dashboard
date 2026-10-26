import type {
  CategoryPreviewResponse,
  DashboardCategory,
  DashboardConfig,
  OverviewResponse,
  StatusResponse,
  TimelineResponse,
  TrendsResponse,
} from "@shared/types";

export class ApiError extends Error {
  constructor(message: string, public readonly status: number, public readonly current?: DashboardConfig) {
    super(message);
  }
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    throw new ApiError(payload?.message ?? payload?.details?.join(", ") ?? `Request failed: ${response.status}`, response.status, payload?.current);
  }
  return response.json() as Promise<T>;
}

function params(values: Record<string, string | number | null | undefined>) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) if (value !== null && value !== undefined && value !== "") query.set(key, String(value));
  return query.toString();
}

export const api = {
  status: () => request<StatusResponse>("/api/status"),
  overview: (date: string, host?: string) => request<OverviewResponse>(`/api/overview?${params({ date, host })}`),
  timeline: (date: string, host?: string) => request<TimelineResponse>(`/api/timeline?${params({ date, host })}`),
  trends: (days: number, host?: string) => request<TrendsResponse>(`/api/trends?${params({ days, host })}`),
  config: () => request<DashboardConfig>("/api/config"),
  patchConfig: (expectedRevision: number, patch: Partial<Pick<DashboardConfig, "locale" | "activityWatchUrl" | "timezone" | "followActivityWatchDayStart" | "dayStart" | "refreshSeconds" | "selectedHost" | "analytics">>) => request<DashboardConfig>("/api/config", { method: "PATCH", body: JSON.stringify({ expectedRevision, patch }) }),
  saveCategories: (expectedRevision: number, categories: DashboardCategory[]) => request<DashboardConfig>("/api/categories", { method: "PUT", body: JSON.stringify({ expectedRevision, categories }) }),
  previewCategories: (date: string, categories: DashboardCategory[], host?: string) => request<CategoryPreviewResponse>("/api/categories/preview", { method: "POST", body: JSON.stringify({ date, categories, host }) }),
  importConfig: (config: unknown) => request<DashboardConfig>("/api/config/import", { method: "POST", body: JSON.stringify(config) }),
  resetConfig: () => request<DashboardConfig>("/api/config/reset", { method: "POST" }),
};
