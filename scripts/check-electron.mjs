/**
 * Preflight for the Electron shell: make sure the castLabs Electron binary
 * actually exists for THIS platform before launching.
 *
 * The castlabs/electron-releases repo ships a path.txt pointing at the macOS
 * binary; if the postinstall download never ran (blocked build scripts,
 * network hiccup), `electron .` fails with a confusing ENOENT. This script
 * detects that state and re-runs the download.
 */

import { execSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const electronPkg = path.join(root, "electron", "node_modules", "electron");

const expectedRelative = {
  linux: "electron",
  darwin: path.join("Electron.app", "Contents", "MacOS", "Electron"),
  win32: "electron.exe",
}[process.platform];

if (!expectedRelative) {
  console.error(`[cider] unsupported platform: ${process.platform}`);
  process.exit(1);
}

function binaryOk() {
  if (!existsSync(electronPkg)) return false;
  const pathFile = path.join(electronPkg, "path.txt");
  const recorded = existsSync(pathFile) ? readFileSync(pathFile, "utf8").trim() : "";
  const binary = path.join(electronPkg, "dist", recorded || expectedRelative);
  // path.txt must match this platform AND the binary must exist.
  const normalized = recorded.split("/").join(path.sep);
  return normalized === expectedRelative && existsSync(binary);
}

if (!existsSync(electronPkg)) {
  console.log("[cider] Electron not installed yet — running pnpm install in electron/ …");
  execSync("pnpm install", { cwd: path.join(root, "electron"), stdio: "inherit" });
}

if (!binaryOk()) {
  console.log("[cider] Electron binary missing or wrong platform — downloading it now (~110 MB)…");
  try {
    execSync("pnpm rebuild electron", { cwd: path.join(root, "electron"), stdio: "inherit" });
  } catch {
    /* fall through to the final check */
  }
}

if (!binaryOk()) {
  console.error(
    "\n[cider] The castLabs Electron binary is still missing.\n" +
      "  Try:  rm -rf electron/node_modules && pnpm --dir electron install\n" +
      "  (the postinstall downloads the binary from GitHub releases — check your network/proxy)\n"
  );
  process.exit(1);
}

console.log("[cider] Electron binary OK for " + process.platform);
