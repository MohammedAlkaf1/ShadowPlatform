// Custom production entry point for hosts that require a literal startup
// file rather than an npm script (Hostinger's "Node.js Web App" panel asks
// for an "Application Startup File"). Functionally equivalent to
// `next start` — reads PORT from the environment the same way — but exists
// as a real .js file because some Node.js app managers execute the startup
// file directly instead of running package.json scripts.
//
// If your Hostinger panel instead lets you set a start COMMAND, prefer
// `npm run build && npm start` (next start) and you don't need this file.
// Next.js's programmatic API installs its own SIGTERM/SIGINT handler by
// default, which calls the underlying HTTP server's .close() automatically.
// If the host's process supervisor sends a termination signal more than
// once (normal on some platforms, e.g. during a restart/health-check cycle),
// that internal handler fires twice and the second .close() call throws
// "Error: Server is not running" (Node's net module throws this when
// close() runs on an already-closed server) — crashing the process, which
// the supervisor then restarts, repeating indefinitely. Opting out here and
// handling the signal ourselves, exactly once, is Next's own documented
// fix for custom servers: https://nextjs.org/docs/pages/guides/custom-server
process.env.NEXT_MANUAL_SIG_HANDLE = "true";

const { createServer } = require("http");
const next = require("next");

const port = parseInt(process.env.PORT || "3000", 10);
const app = next({ dev: process.env.NODE_ENV !== "production" });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  const httpServer = createServer((req, res) => handle(req, res)).listen(port, () => {
    console.log(`> Ready on port ${port}`);
  });

  let shuttingDown = false;
  function shutdown(signal) {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`> Received ${signal}, shutting down`);
    httpServer.close(() => process.exit(0));
  }
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
});
