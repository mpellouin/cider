/**
 * Preflight for the Electron shell: make sure the castLabs Electron binary
 * actually exists for THIS platform before launching — WITHOUT trusting
 * electron's install.js, which exits silently in several situations
 * (ELECTRON_SKIP_BINARY_DOWNLOAD set, and a known silent no-extract on
 * recent Node versions).
 *
 * Strategy:
 *   1. binary already there → done
 *   2. a matching zip exists in the electron cache → extract it ourselves
 *   3. no zip → run install.js (env-scrubbed) to download, then extract
 *      ourselves if install.js didn't
 *   4. still nothing → force a fresh download and extract
 */

import { execSync, spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  openSync,
  readSync,
  closeSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const electronPkg = path.join(root, "electron", "node_modules", "electron");
const distPath = path.join(electronPkg, "dist");

const expectedRelative = {
  linux: "electron",
  darwin: path.join("Electron.app", "Contents", "MacOS", "Electron"),
  win32: "electron.exe",
}[process.platform];

if (!expectedRelative) {
  console.error(`[cider] unsupported platform: ${process.platform}`);
  process.exit(1);
}

if (!existsSync(electronPkg)) {
  console.log("[cider] Electron not installed yet — running pnpm install in electron/ …");
  execSync("pnpm install", { cwd: path.join(root, "electron"), stdio: "inherit" });
}

const electronVersion = JSON.parse(
  readFileSync(path.join(electronPkg, "package.json"), "utf8")
).version;
const zipName = `electron-v${electronVersion}-${process.platform}-${process.arch}.zip`;

function binaryOk() {
  const binary = path.join(distPath, expectedRelative);
  return existsSync(binary);
}

function markInstalled() {
  // What install.js would have written had it finished.
  writeFileSync(path.join(electronPkg, "path.txt"), expectedRelative.split(path.sep).join("/"));
  const versionFile = path.join(distPath, "version");
  if (!existsSync(versionFile)) writeFileSync(versionFile, `v${electronVersion}`);
}

function cacheRoots() {
  return [
    process.env.electron_config_cache,
    process.env.XDG_CACHE_HOME ? path.join(process.env.XDG_CACHE_HOME, "electron") : null,
    path.join(os.homedir(), ".cache", "electron"),
    path.join(os.homedir(), "Library", "Caches", "electron"),
    process.env.LOCALAPPDATA ? path.join(process.env.LOCALAPPDATA, "electron", "Cache") : null,
  ].filter(Boolean);
}

function findCachedZip() {
  for (const cacheRoot of cacheRoots()) {
    try {
      const entries = readdirSync(cacheRoot, { recursive: true });
      for (const entry of entries) {
        if (String(entry).endsWith(zipName)) return path.join(cacheRoot, String(entry));
      }
    } catch {
      /* cache root doesn't exist */
    }
  }
  return null;
}

function looksLikeZip(file) {
  try {
    const fd = openSync(file, "r");
    const header = Buffer.alloc(4);
    readSync(fd, header, 0, 4, 0);
    closeSync(fd);
    return header[0] === 0x50 && header[1] === 0x4b; // "PK"
  } catch {
    return false;
  }
}

async function extractZip(zipPath) {
  const size = statSync(zipPath).size;
  console.log(`[cider] Extracting ${zipPath} (${(size / 1e6).toFixed(1)} MB) → ${distPath}`);
  if (size < 20_000_000 || !looksLikeZip(zipPath)) {
    throw new Error(
      `cached file doesn't look like a valid Electron zip (${size} bytes) — likely a corrupt download`
    );
  }
  rmSync(distPath, { recursive: true, force: true });
  mkdirSync(distPath, { recursive: true });

  // System tools FIRST: the extract-zip/yauzl shipped with electron
  // deadlocks (promise never settles) on recent Node versions.
  const attempts =
    process.platform === "win32"
      ? [["tar", ["-xf", zipPath, "-C", distPath]]]
      : [
          ["unzip", ["-o", "-q", zipPath, "-d", distPath]],
          ["bsdtar", ["-xf", zipPath, "-C", distPath]],
        ];

  let extracted = false;
  for (const [cmd, args] of attempts) {
    const result = spawnSync(cmd, args, { stdio: "inherit" });
    if (result.status === 0) {
      extracted = true;
      break;
    }
    // tool not installed → try the next one quietly; real failure → report
    if (!result.error || result.error.code !== "ENOENT") {
      console.warn(`[cider] ${cmd} exited with ${result.status ?? result.error?.code}`);
    }
  }

  // extract-zip as a guarded fallback, with a hang timeout.
  if (!extracted) {
    try {
      const realPkg = realpathSync(electronPkg);
      const requireFromElectron = createRequire(path.join(realPkg, "package.json"));
      const extract = requireFromElectron("extract-zip");
      let timer;
      const outcome = await Promise.race([
        extract(zipPath, { dir: distPath }).then(
          () => "ok",
          (err) => {
            console.warn(`[cider] extract-zip failed: ${err?.message ?? err}`);
            return "error";
          }
        ),
        new Promise((resolve) => {
          timer = setTimeout(() => resolve("timeout"), 120_000);
        }),
      ]);
      clearTimeout(timer);
      if (outcome === "ok") extracted = true;
      else if (outcome === "timeout") console.warn("[cider] extract-zip hung — known issue on recent Node");
    } catch (err) {
      console.warn(`[cider] extract-zip unavailable: ${err?.message ?? err}`);
    }
  }

  // Last resort: python3 zipfile, restoring unix permission bits manually.
  if (!extracted && process.platform !== "win32") {
    const py =
      "import zipfile,os,sys\n" +
      "z=zipfile.ZipFile(sys.argv[1]); d=sys.argv[2]\n" +
      "z.extractall(d)\n" +
      "for i in z.infolist():\n" +
      "    m=i.external_attr>>16\n" +
      "    if m: os.chmod(os.path.join(d,i.filename),m)\n";
    const result = spawnSync("python3", ["-c", py, zipPath, distPath], { stdio: "inherit" });
    if (result.status === 0) extracted = true;
  }

  if (!extracted) {
    throw new Error(
      "could not extract the Electron zip — install `unzip` (e.g. sudo apt install unzip) and re-run"
    );
  }

  // Make sure the executables kept their exec bits regardless of extractor.
  if (process.platform !== "win32") {
    for (const bin of ["electron", "chrome_crashpad_handler", "Electron.app/Contents/MacOS/Electron"]) {
      const p = path.join(distPath, bin);
      if (existsSync(p)) {
        try {
          chmodSync(p, 0o755);
        } catch {
          /* best effort */
        }
      }
    }
  }

  markInstalled();
}

function runInstallJs(force) {
  const env = { ...process.env };
  if (env.ELECTRON_SKIP_BINARY_DOWNLOAD) {
    console.warn("[cider] Ignoring ELECTRON_SKIP_BINARY_DOWNLOAD for this download.");
    delete env.ELECTRON_SKIP_BINARY_DOWNLOAD;
  }
  delete env.npm_config_platform;
  delete env.npm_config_arch;
  if (force) env.force_no_cache = "true";
  try {
    execSync(`"${process.execPath}" install.js`, { cwd: electronPkg, stdio: "inherit", env });
  } catch {
    /* verified by the caller */
  }
}

/* ------------------------------------------------------------------ */

if (!binaryOk()) {
  // 1. Something already in the cache? Extract it ourselves — install.js
  //    "Cache hit"s and then silently does nothing on some Node versions.
  let zip = findCachedZip();
  if (zip) {
    try {
      await extractZip(zip);
    } catch (err) {
      console.warn(`[cider] ${err.message}`);
      console.log("[cider] Removing the bad cached zip and downloading fresh…");
      rmSync(zip, { force: true });
      zip = null;
    }
  }

  // 2. No (valid) zip → download, then extract whatever landed in the cache.
  if (!binaryOk()) {
    console.log(`[cider] Downloading Electron v${electronVersion} (~110 MB)…`);
    runInstallJs(!zip);
    if (!binaryOk()) {
      const fresh = findCachedZip();
      if (fresh) await extractZip(fresh).catch((err) => console.error(`[cider] ${err.message}`));
    }
  }
}

if (!binaryOk()) {
  console.error(
    "\n[cider] The castLabs Electron binary is still missing.\n" +
      `  Expected: electron/node_modules/electron/dist/${expectedRelative}\n` +
      `  Cache roots checked: ${cacheRoots().join(", ")}\n` +
      "  Check your network/proxy, then re-run. The binary comes from\n" +
      "  github.com/castlabs/electron-releases releases.\n"
  );
  process.exit(1);
}

console.log(`[cider] Electron binary OK for ${process.platform} (${expectedRelative})`);
// Exit explicitly: a hung extract-zip promise must not keep (or kill) the process.
process.exit(0);
