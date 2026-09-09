// Custom production entry point for hosts that require a literal startup
// file rather than an npm script (Hostinger's "Node.js Web App" panel asks
// for an "Application Startup File"). Functionally equivalent to
// `next start` — reads PORT from the environment the same way — but exists
// as a real .js file because some Node.js app managers execute the startup
// file directly instead of running package.json scripts.
//
// If your Hostinger panel instead lets you set a start COMMAND, prefer
// `npm run build && npm start` (next start) and you don't need this file.
const { createServer } = require("http");
const next = require("next");

const port = parseInt(process.env.PORT || "3000", 10);
const app = next({ dev: process.env.NODE_ENV !== "production" });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  createServer((req, res) => handle(req, res)).listen(port, () => {
    console.log(`> Ready on port ${port}`);
  });
});
