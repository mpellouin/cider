/**
 * Electron launcher with Linux sandbox handling.
 *
 * Chromium's sandbox needs either unprivileged user namespaces (blocked on
 * Ubuntu 23.10+ by AppArmor) or a setuid-root chrome-sandbox helper (which
 * an npm extraction can't produce). When neither is available Electron
 * aborts with SIGTRAP. This launcher detects that situation up front, and
 * also retries once without the sandbox if the first attempt still dies.
 */

const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");

const distPath = path.join(__dirname, "node_modules", "electron", "dist");
const electronBin = path.join(
  distPath,
  process.platform === "win32"
    ? "electron.exe"
    : process.platform === "darwin"
      ? path.join("Electron.app", "Contents", "MacOS", "Electron")
      : "electron"
);

if (!fs.existsSync(electronBin)) {
  console.error(`[cider] Electron binary not found at ${electronBin} — run: node ../scripts/check-electron.mjs`);
  process.exit(1);
}

const forwardedArgs = process.argv.slice(2);

function sandboxDiagnosis() {
  if (process.platform !== "linux") return { ok: true };

  const helper = path.join(distPath, "chrome-sandbox");
  try {
    const st = fs.statSync(helper);
    if (st.uid === 0 && (st.mode & 0o4000) !== 0) return { ok: true }; // setuid root helper
  } catch {
    /* helper missing — rely on userns */
  }

  // Debian-style toggle: 0 = unprivileged userns forbidden.
  try {
    if (fs.readFileSync("/proc/sys/kernel/unprivileged_userns_clone", "utf8").trim() === "0") {
      return { ok: false, helper };
    }
  } catch {
    /* file absent → not restricted this way */
  }

  // Ubuntu 23.10+ AppArmor restriction: 1 = userns blocked for unconfined apps.
  try {
    if (
      fs.readFileSync("/proc/sys/kernel/apparmor_restrict_unprivileged_userns", "utf8").trim() === "1"
    ) {
      return { ok: false, helper };
    }
  } catch {
    /* file absent → not restricted this way */
  }

  return { ok: true };
}

function launch(disableSandbox) {
  const env = { ...process.env };
  if (disableSandbox) env.ELECTRON_DISABLE_SANDBOX = "1";
  return spawn(electronBin, [__dirname, ...forwardedArgs], { stdio: "inherit", env });
}

function explainProperFix(helper) {
  console.warn(
    `[cider] Running without the Chromium sandbox. For a sandboxed run:\n` +
      `        sudo chown root:root "${helper}" && sudo chmod 4755 "${helper}"\n` +
      `        (must be redone after each Electron re-install)`
  );
}

const diag = sandboxDiagnosis();
let disabledSandbox = false;

if (!diag.ok) {
  console.warn("[cider] Chromium sandbox unavailable (userns restricted, no setuid helper).");
  explainProperFix(diag.helper);
  disabledSandbox = true;
}

const startedAt = Date.now();
let child = launch(disabledSandbox);

child.on("exit", (code, signal) => {
  const quickCrash = Date.now() - startedAt < 10_000;
  const sandboxCrash = signal === "SIGTRAP" || signal === "SIGABRT";
  if (!disabledSandbox && quickCrash && sandboxCrash) {
    console.warn("[cider] Electron aborted at startup (likely the sandbox) — retrying without it.");
    explainProperFix(path.join(distPath, "chrome-sandbox"));
    disabledSandbox = true;
    child = launch(true);
    child.on("exit", (code2, signal2) => process.exit(code2 ?? (signal2 ? 1 : 0)));
    return;
  }
  process.exit(code ?? (signal ? 1 : 0));
});

for (const sig of ["SIGINT", "SIGTERM"]) {
  process.on(sig, () => child.kill(sig));
}
