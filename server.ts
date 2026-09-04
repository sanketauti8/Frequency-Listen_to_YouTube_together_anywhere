/**
 * Combined server: Next.js (HTTP + pages + API routes) and Socket.IO share one
 * port. This keeps local testing on phones trivial (one URL) and deployment
 * simple (one process).
 */

import { createServer } from "http";
import next from "next";
import { initSocketServer } from "./server/socket-server";

const dev = process.env.NODE_ENV !== "production";
const hostname = "0.0.0.0"; // bind on all interfaces so LAN phones can reach it
const port = Number(process.env.PORT) || 3000;

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  const httpServer = createServer((req, res) => {
    handle(req, res);
  });

  initSocketServer(httpServer);

  httpServer.listen(port, hostname, () => {
    // eslint-disable-next-line no-console
    console.log(
      `\n  ▶ sync-listen ready\n  • Local:   http://localhost:${port}\n  • Network: http://<your-LAN-IP>:${port}   (open this on your phones)\n`
    );
  });
}).catch((err) => {
  // eslint-disable-next-line no-console
  console.error("Failed to start server:", err);
  process.exit(1);
});
