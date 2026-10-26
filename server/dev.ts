import { createServer as createViteServer } from "vite";
import { createApp } from "./app";

const port = Number(process.env.PORT ?? 15173);
const host = "127.0.0.1";

const app = createApp();
const vite = await createViteServer({
  appType: "spa",
  server: { middlewareMode: true },
});

// Vite injects a small inline module for React refresh. Production keeps the
// stricter CSP from createApp(); only development HTML needs this exception.
app.use((_request, response, next) => {
  response.removeHeader("Content-Security-Policy");
  next();
});
app.use(vite.middlewares);
app.listen(port, host, () => {
  console.log(`Tempo development server listening at http://${host}:${port}`);
});
