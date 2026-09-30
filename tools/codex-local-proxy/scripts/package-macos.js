import fs from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import process from "node:process";

function renderLauncher({ serverPort = 3456, preview = false } = {}) {
  const envLine = preview ? "export CODEX_ROUTER_PORT=3457\n" : "";

  return `#!/bin/zsh
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
NODE_BIN="$ROOT_DIR/runtime/bin/node"
APP_DIR="$ROOT_DIR/app"
RUN_DIR="$HOME/.codex-router/run"
LOG_DIR="$HOME/.codex-router/logs"
PID_FILE="$RUN_DIR/codex-local-proxy.pid"
LOG_FILE="$LOG_DIR/codex-local-proxy.log"

mkdir -p "$RUN_DIR" "$LOG_DIR"

export HTTP_PROXY="\${HTTP_PROXY:-http://127.0.0.1:7897}"
export HTTPS_PROXY="\${HTTPS_PROXY:-http://127.0.0.1:7897}"
export NO_PROXY="\${NO_PROXY:+\${NO_PROXY},}127.0.0.1,localhost"

if [[ -f "$PID_FILE" ]]; then
  PID="$(cat "$PID_FILE" 2>/dev/null || true)"
  if [[ -n "$PID" ]] && kill -0 "$PID" 2>/dev/null; then
    echo "codex-local-proxy already running (PID $PID)"
    echo "dashboard: http://127.0.0.1:${serverPort}/"
    exit 0
  fi
  rm -f "$PID_FILE"
fi

${envLine}nohup "$NODE_BIN" --use-env-proxy "$APP_DIR/src/server.js" >> "$LOG_FILE" 2>&1 &
PID=$!
echo "$PID" > "$PID_FILE"
echo "codex-local-proxy started (PID $PID)"
echo "dashboard: http://127.0.0.1:${serverPort}/"
`;
}

function renderStopLauncher() {
  return `#!/bin/zsh
set -euo pipefail

PID_FILE="$HOME/.codex-router/run/codex-local-proxy.pid"

if [[ ! -f "$PID_FILE" ]]; then
  echo "codex-local-proxy is not running"
  exit 0
fi

PID="$(cat "$PID_FILE" 2>/dev/null || true)"

if [[ -z "$PID" ]]; then
  rm -f "$PID_FILE"
  echo "codex-local-proxy is not running"
  exit 0
fi

if kill -0 "$PID" 2>/dev/null; then
  kill "$PID"
  echo "codex-local-proxy stopped (PID $PID)"
else
  echo "stale pid file removed"
fi

rm -f "$PID_FILE"
`;
}

function renderStatusLauncher() {
  return `#!/bin/zsh
set -euo pipefail

PID_FILE="$HOME/.codex-router/run/codex-local-proxy.pid"
STATUS_URL="http://127.0.0.1:3456/_router/status"

if [[ ! -f "$PID_FILE" ]]; then
  echo "codex-local-proxy is not running"
  exit 0
fi

PID="$(cat "$PID_FILE" 2>/dev/null || true)"

if [[ -z "$PID" ]]; then
  echo "codex-local-proxy is not running"
  exit 0
fi

if kill -0 "$PID" 2>/dev/null; then
  echo "codex-local-proxy running (PID $PID)"
  if command -v curl >/dev/null 2>&1; then
    curl -fsS "$STATUS_URL" || true
  fi
else
  echo "codex-local-proxy pid file exists but process is gone"
fi
`;
}

function renderOpenDashboardLauncher() {
  return `#!/bin/zsh
set -euo pipefail
open "http://127.0.0.1:3456/"
`;
}

async function writeExecutable(filePath, content) {
  await fs.writeFile(filePath, content, "utf8");
  await fs.chmod(filePath, 0o755);
}

async function readPackageVersion(projectRoot) {
  const packageJson = JSON.parse(
    await fs.readFile(path.join(projectRoot, "package.json"), "utf8")
  );
  return packageJson.version;
}

export async function buildMacosBundle({
  projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), ".."),
  distRoot = path.join(projectRoot, "dist"),
  nodeBinaryPath = process.execPath
} = {}) {
  const version = await readPackageVersion(projectRoot);
  const bundleName = `codex-local-proxy-macos-v${version}`;
  const bundlePath = path.join(distRoot, bundleName);
  const appPath = path.join(bundlePath, "app");
  const runtimeBinPath = path.join(bundlePath, "runtime", "bin");
  const launcherPath = path.join(bundlePath, "bin");

  await fs.rm(bundlePath, { recursive: true, force: true });
  await fs.mkdir(appPath, { recursive: true });
  await fs.mkdir(runtimeBinPath, { recursive: true });
  await fs.mkdir(launcherPath, { recursive: true });

  await fs.cp(path.join(projectRoot, "src"), path.join(appPath, "src"), { recursive: true });
  await fs.cp(path.join(projectRoot, "scripts"), path.join(appPath, "scripts"), { recursive: true });
  await fs.copyFile(path.join(projectRoot, "README.md"), path.join(bundlePath, "README.md"));
  await fs.copyFile(path.join(projectRoot, "package.json"), path.join(bundlePath, "package.json"));
  await fs.copyFile(nodeBinaryPath, path.join(runtimeBinPath, "node"));
  await fs.chmod(path.join(runtimeBinPath, "node"), 0o755);

  await writeExecutable(path.join(launcherPath, "start.command"), renderLauncher());
  await writeExecutable(path.join(launcherPath, "start-preview.command"), renderLauncher({
    serverPort: 3457,
    preview: true
  }));
  await writeExecutable(path.join(launcherPath, "stop.command"), renderStopLauncher());
  await writeExecutable(path.join(launcherPath, "status.command"), renderStatusLauncher());
  await writeExecutable(path.join(launcherPath, "open-dashboard.command"), renderOpenDashboardLauncher());

  return bundlePath;
}

async function main() {
  const bundlePath = await buildMacosBundle();
  process.stdout.write(`Created macOS bundle: ${bundlePath}\n`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    process.stderr.write(`${error.stack || error.message}\n`);
    process.exitCode = 1;
  });
}
