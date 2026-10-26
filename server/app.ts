import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { AnalyticsService } from "./analytics-service";
import { categorySchema, configPatchSchema, ConfigStore, RevisionConflictError } from "./config";

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((date) => !Number.isNaN(Date.parse(`${date}T00:00:00Z`)));

export function createApp(options?: { cwd?: string; dataDir?: string; startBackgroundJobs?: boolean }) {
  const app = express();
  const cwd = options?.cwd ?? process.cwd();
  const dataDir = options?.dataDir ?? (options?.cwd ? path.join(cwd, "localappdata", "Tempo") : undefined);
  const store = new ConfigStore(cwd, dataDir);
  const analytics = new AnalyticsService();

  app.disable("x-powered-by");
  app.use(express.json({ limit: "256kb" }));
  app.use((_request, response, next) => {
    response.setHeader("X-Content-Type-Options", "nosniff");
    response.setHeader("Referrer-Policy", "no-referrer");
    response.setHeader("Content-Security-Policy", "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'");
    next();
  });

  const config = () => store.load();

  app.get("/api/health", (_request, response) => {
    response.json({
      service: "tempo-activitywatch-dashboard",
      status: "ready",
      version: "1.0.0",
    });
  });

  app.get("/api/status", asyncHandler(async (_request, response) => {
    response.json({ ...(await analytics.getStatus(await config())), configStorage: store.getStorageStatus() });
  }));

  app.get("/api/overview", asyncHandler(async (request, response) => {
    const date = dateSchema.parse(request.query.date);
    const currentConfig = await config();
    response.json(await analytics.getOverview(currentConfig, date, optionalString(request.query.host)));
  }));

  app.get("/api/timeline", asyncHandler(async (request, response) => {
    const date = dateSchema.parse(request.query.date);
    response.json(await analytics.getTimeline(await config(), date, optionalString(request.query.host)));
  }));

  app.get("/api/trends", asyncHandler(async (request, response) => {
    const days = z.coerce.number().int().refine((value) => [7, 30, 90].includes(value)).parse(request.query.days);
    const currentConfig = await config();
    const trends = await analytics.getTrends(currentConfig, days, optionalString(request.query.host));
    response.json(trends);
  }));

  app.get("/api/config", asyncHandler(async (_request, response) => {
    response.json(await config());
  }));

  app.patch("/api/config", asyncHandler(async (request, response) => {
    const saved = await store.patch(configPatchSchema.parse(request.body));
    analytics.clearCache();
    response.json(saved);
  }));

  app.put("/api/categories", asyncHandler(async (request, response) => {
    const body = z.object({ expectedRevision: z.number().int().min(0), categories: z.array(categorySchema).min(1).max(60) }).parse(request.body);
    const saved = await store.replaceCategories(body.categories, body.expectedRevision);
    analytics.clearCache();
    response.json(saved);
  }));

  app.post("/api/categories/preview", asyncHandler(async (request, response) => {
    const body = z.object({
      date: dateSchema,
      host: z.string().optional(),
      categories: z.array(categorySchema).min(1).max(60),
    }).parse(request.body);
    response.json(await analytics.previewCategories(await config(), body.categories, body.date, body.host));
  }));

  app.get("/api/config/export", asyncHandler(async (_request, response) => {
    response.setHeader("Content-Disposition", "attachment; filename=tempo-config.json");
    response.json(await config());
  }));

  app.post("/api/config/import", asyncHandler(async (request, response) => {
    const saved = await store.import(request.body);
    analytics.clearCache();
    response.json(saved);
  }));

  app.post("/api/config/reset", asyncHandler(async (_request, response) => {
    const saved = await store.reset();
    analytics.clearCache();
    response.json(saved);
  }));

  if (process.env.NODE_ENV === "production") {
    const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../dist");
    app.use(express.static(root));
    app.get("/{*splat}", (_request, response) => response.sendFile(path.join(root, "index.html")));
  }

  app.use((error: unknown, _request: express.Request, response: express.Response, _next: express.NextFunction) => {
    void _next;
    if (error instanceof z.ZodError) {
      response.status(400).json({ error: "invalid_request", details: error.issues.map((issue) => issue.message) });
      return;
    }
    if (error instanceof RevisionConflictError) {
      response.status(409).json({ error: "revision_conflict", message: error.message, current: error.current });
      return;
    }
    const message = error instanceof Error ? error.message : "Unexpected server error";
    const status = /Unknown ActivityWatch host|Invalid date/.test(message) ? 400 : 503;
    response.status(status).json({ error: status === 400 ? "invalid_request" : "activitywatch_unavailable", message });
  });

  return app;
}

function optionalString(value: unknown) {
  return typeof value === "string" && value ? value : undefined;
}

function asyncHandler(handler: (request: express.Request, response: express.Response) => Promise<void>) {
  return (request: express.Request, response: express.Response, next: express.NextFunction) => {
    handler(request, response).catch(next);
  };
}
