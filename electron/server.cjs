/**
 * Minimal static file server for the built UI.
 *
 * Serving over http://localhost gives MusicKit a real web origin — Apple's
 * sign-in (an OAuth-like postMessage flow) rejects file:// origins, and a
 * secure-context origin also keeps EME/Widevine happy. No external deps.
 */

const http = require("http");
const fs = require("fs");
const path = require("path");

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".ico": "image/x-icon",
  ".map": "application/json; charset=utf-8",
};

/**
 * Start serving `rootDir` on 127.0.0.1. Resolves to the base URL.
 * @param {string} rootDir absolute path to ui/dist
 */
function startStaticServer(rootDir) {
  const root = fs.realpathSync(rootDir);
  const indexHtml = path.join(root, "index.html");

  const server = http.createServer((req, res) => {
    let urlPath;
    try {
      urlPath = decodeURIComponent(new URL(req.url, "http://localhost").pathname);
    } catch {
      urlPath = "/";
    }

    // Resolve within root, block path traversal.
    let filePath = path.join(root, urlPath);
    if (!filePath.startsWith(root)) {
      res.writeHead(403).end("Forbidden");
      return;
    }

    // SPA fallback: unknown paths and "/" serve index.html.
    if (urlPath === "/" || !fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
      filePath = indexHtml;
    }

    fs.readFile(filePath, (err, data) => {
      if (err) {
        res.writeHead(404).end("Not found");
        return;
      }
      const ext = path.extname(filePath).toLowerCase();
      res.writeHead(200, {
        "Content-Type": MIME[ext] || "application/octet-stream",
        "Cache-Control": "no-cache",
      });
      res.end(data);
    });
  });

  return new Promise((resolve, reject) => {
    server.on("error", reject);
    // Port 0 → OS picks a free port; bind to loopback only.
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      resolve({ url: `http://localhost:${port}`, server });
    });
  });
}

module.exports = { startStaticServer };
