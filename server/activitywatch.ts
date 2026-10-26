import type { ActivityWatchBucket, ActivityWatchEvent } from "../shared/types";

interface ActivityWatchInfo {
  hostname: string;
  version: string;
  device_id?: string;
}

export interface ActivityWatchClass {
  id?: number | string;
  name?: string[];
  data?: { color?: string };
  rule?: { regex?: string; ignore_case?: boolean; type?: string };
}

export interface ActivityWatchSettings {
  startOfDay?: string;
  startOfWeek?: string;
  classes?: ActivityWatchClass[];
}

export class ActivityWatchError extends Error {
  constructor(message: string, public readonly status?: number) {
    super(message);
    this.name = "ActivityWatchError";
  }
}

export class ActivityWatchClient {
  constructor(private readonly baseUrl: string) {}

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);
    try {
      const response = await fetch(`${this.baseUrl}${path}`, {
        ...init,
        signal: controller.signal,
        headers: { "Content-Type": "application/json", ...init?.headers },
      });
      if (!response.ok) throw new ActivityWatchError(`ActivityWatch returned ${response.status}`, response.status);
      return await response.json() as T;
    } catch (error) {
      if (error instanceof ActivityWatchError) throw error;
      throw new ActivityWatchError(controller.signal.aborted
        ? `ActivityWatch ${path} timed out after 10 seconds`
        : `ActivityWatch ${path}: ${error instanceof Error ? error.message : "Unable to reach ActivityWatch"}`);
    } finally {
      clearTimeout(timeout);
    }
  }

  getInfo() {
    return this.request<ActivityWatchInfo>("/api/0/info");
  }

  async getBuckets(): Promise<ActivityWatchBucket[]> {
    const buckets = await this.request<Record<string, Omit<ActivityWatchBucket, "id">>>("/api/0/buckets/");
    return Object.entries(buckets).map(([id, bucket]) => ({ id, ...bucket }));
  }

  getSettings() {
    return this.request<ActivityWatchSettings>("/api/0/settings");
  }

  async query<T>(query: string[], timeperiods: string[]): Promise<T[]> {
    const results: T[] = [];
    // Keep each upstream query small; AW executes every timeperiod in one request.
    for (const period of timeperiods) {
      const batch = await this.request<T[]>("/api/0/query/", {
        method: "POST",
        body: JSON.stringify({ query, timeperiods: [period] }),
      });
      if (!Array.isArray(batch) || batch.length !== 1) {
        throw new ActivityWatchError("ActivityWatch query returned an incomplete result");
      }
      results.push(batch[0]);
    }
    return results;
  }

  async getEvents(bucketId: string, start: string, end: string) {
    const query = new URLSearchParams({ start, end });
    return this.request<ActivityWatchEvent[]>(`/api/0/buckets/${encodeURIComponent(bucketId)}/events?${query}`);
  }
}

