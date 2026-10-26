import { createApp } from "./app";

const port = Number(process.env.PORT ?? 15173);
const host = "127.0.0.1";

createApp().listen(port, host, () => {
  console.log(`Tempo dashboard server listening at http://${host}:${port}`);
});
