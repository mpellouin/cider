/**
 * Dev runner for the Electron-Widevine shell:
 * starts the Vite dev server, waits for it, then launches Electron
 * pointed at it. Ctrl-C tears both down.
 */

import { spawn, spawnSync } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = fileURLToPath(new URL("..", import.meta.url));
const DEV_URL = "http://localhost:1420";

// Make sure the Electron binary is actually there before we start anything.
const check = spawnSync(process.execPath, [path.join(root, "scripts", "check-electron.mjs")], {
  stdio: "inherit",
});
if (check.status !== 0) process.exit(check.status ?? 1);

const children = [];

function run(cmd, args, opts = {}) {
  const child = spawn(cmd, args, { stdio: "inherit", cwd: root, ...opts });
  children.push(child);
  return child;
}

function shutdown(code = 0) {
  for (const child of children) {
    if (!child.killed) child.kill("SIGTERM");
  }
  process.exit(code);
}

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));

const vite = run("pnpm", ["--dir", "ui", "dev"]);
vite.on("exit", (code) => shutdown(code ?? 0));

// Wait for the dev server to come up (up to ~30s).
let ready = false;
for (let i = 0; i < 60 && !ready; i++) {
  try {
    const res = await fetch(DEV_URL, { method: "HEAD" });
    ready = res.ok || res.status < 500;
  } catch {
    await sleep(500);
  }
}
if (!ready) {
  console.error("[dev-shell] Vite dev server never came up at " + DEV_URL);
  shutdown(1);
}

const electron = run(process.execPath, [path.join(root, "electron", "launch.cjs"), "--dev"], {
  env: { ...process.env, CIDER_DEV_URL: DEV_URL },
});
electron.on("exit", (code) => shutdown(code ?? 0));
