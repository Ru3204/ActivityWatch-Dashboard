import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createApp } from "./app";

const originalFetch = globalThis.fetch;
const tempDirs: string[] = [];

afterEach(async () => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
  await Promise.all(tempDirs.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

async function testApp() {
  const cwd = await mkdtemp(path.join(tmpdir(), "tempo-test-"));
  tempDirs.push(cwd);
  return createApp({ cwd, startBackgroundJobs: false });
}

function jsonResponse(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), { status, headers: { "Content-Type": "application/json" } });
}

function mockActivityWatch(options?: { afk?: boolean; web?: boolean; secondHost?: boolean; activeEvents?: unknown[] }) {
  const afk = options?.afk ?? true;
  const web = options?.web ?? false;
  const buckets: Record<string, unknown> = {
    "window-HOST": { type: "currentwindow", client: "window", hostname: "HOST", created: "2026-01-01T00:00:00Z" },
    ...(afk ? { "afk-HOST": { type: "afkstatus", client: "afk", hostname: "HOST", created: "2026-01-01T00:00:00Z" } } : {}),
    ...(web ? { "web-HOST": { type: "web.tab.current", client: "web", hostname: "HOST", created: "2026-01-01T00:00:00Z" } } : {}),
    ...(options?.secondHost ? { "window-SECOND": { type: "currentwindow", client: "window", hostname: "SECOND", created: "2026-01-01T00:00:00Z" } } : {}),
  };
  globalThis.fetch = vi.fn(async (input: string | URL | Request) => {
    const url = String(input);
    if (url.endsWith("/api/0/info")) return jsonResponse({ hostname: "HOST", version: "v-test" });
    if (url.endsWith("/api/0/buckets/")) return jsonResponse(buckets);
    if (url.endsWith("/api/0/settings")) return jsonResponse({ startOfDay: "04:00", classes: [] });
    if (url.endsWith("/api/0/query/")) return jsonResponse([{ window: [], afk: [], active: options?.activeEvents ?? [], stopwatch: [], web: [] }]);
    return jsonResponse({}, 404);
  }) as typeof fetch;
}

describe("dashboard API", () => {
  it("exposes a stable health check without contacting ActivityWatch", async () => {
    globalThis.fetch = vi.fn(async () => { throw new TypeError("should not be called"); }) as typeof fetch;
    const response = await request(await testApp()).get("/api/health");
    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      service: "tempo-activitywatch-dashboard",
      status: "ready",
      version: "1.0.0",
    });
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it("reports an offline ActivityWatch server without crashing", async () => {
    globalThis.fetch = vi.fn(async () => { throw new TypeError("connection refused"); }) as typeof fetch;
    const response = await request(await testApp()).get("/api/status");
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ connected: false, warnings: ["activitywatch-offline"] });
  });

  it.each([
    { name: "full desktop watchers", options: { afk: true, web: true }, warning: undefined, web: true },
    { name: "missing AFK and browser watchers", options: { afk: false, web: false }, warning: "missing-afk", web: false },
    { name: "multiple hosts", options: { afk: true, web: false, secondHost: true }, warning: "missing-web", web: false },
  ])("discovers $name", async ({ options, warning, web }) => {
    mockActivityWatch(options);
    const response = await request(await testApp()).get("/api/status");
    expect(response.status).toBe(200);
    expect(response.body.connected).toBe(true);
    expect(response.body.hosts[0].web).toBe(web);
    if (warning) expect(response.body.warnings).toContain(warning);
    if (options.secondHost) expect(response.body.hosts.map((host: { host: string }) => host.host)).toContain("SECOND");
  });

  it("returns a stable empty overview when the watcher has no events", async () => {
    mockActivityWatch({ afk: true, web: false });
    const response = await request(await testApp()).get("/api/overview?date=2026-08-13&host=HOST");
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ activeSeconds: 0, apps: [] });
    expect(response.body.dataQuality).toContainEqual({ code: "empty-range", severity: "info" });
  });

  it("gives duplicate ActivityWatch events distinct UI identities", async () => {
    const duplicate = {
      id: 13231,
      timestamp: "2026-08-13T01:00:00.000Z",
      duration: 30,
      data: { app: "Code.exe", title: "Architecture notes" },
    };
    mockActivityWatch({ afk: true, activeEvents: [duplicate, duplicate] });
    const response = await request(await testApp()).get("/api/overview?date=2026-08-13&host=HOST");
    const ids = response.body.recentSegments.map((segment: { id: string }) => segment.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("rejects stale revisions and a settings patch cannot overwrite categories", async () => {
    mockActivityWatch({ afk: true, web: true });
    const app = await testApp();
    const initial = (await request(app).get("/api/config")).body;
    const categories = initial.categories.map((category: any) => category.id === "work" ? { ...category, name: { ...category.name, en: "Saved category" } } : category);
    const categorySave = await request(app).put("/api/categories").send({ expectedRevision: initial.revision, categories });
    expect(categorySave.status).toBe(200);
    const stale = await request(app).patch("/api/config").send({ expectedRevision: initial.revision, patch: { locale: "en" } });
    expect(stale.status).toBe(409);
    expect(stale.body.current.categories[0].name.en).toBe("Saved category");
    const settingsSave = await request(app).patch("/api/config").send({ expectedRevision: categorySave.body.revision, patch: { locale: "en" } });
    expect(settingsSave.status).toBe(200);
    expect(settingsSave.body.categories[0].name.en).toBe("Saved category");
  });

});
