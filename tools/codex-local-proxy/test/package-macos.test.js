import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { buildMacosBundle } from "../scripts/package-macos.js";

async function createFixtureProject() {
  const projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), "codex-local-proxy-project-"));
  const fakeNodePath = path.join(projectRoot, "fake-node");

  await fs.mkdir(path.join(projectRoot, "src"), { recursive: true });
  await fs.mkdir(path.join(projectRoot, "scripts"), { recursive: true });

  await fs.writeFile(
    path.join(projectRoot, "package.json"),
    JSON.stringify({ name: "codex-local-proxy", version: "9.9.9", type: "module" }, null, 2) + "\n",
    "utf8"
  );
  await fs.writeFile(path.join(projectRoot, "README.md"), "# fixture\n", "utf8");
  await fs.writeFile(path.join(projectRoot, "src", "server.js"), "console.log('server');\n", "utf8");
  await fs.writeFile(path.join(projectRoot, "src", "cli.js"), "console.log('cli');\n", "utf8");
  await fs.writeFile(path.join(projectRoot, "scripts", "init-config.js"), "console.log('init');\n", "utf8");
  await fs.writeFile(fakeNodePath, "#!/bin/sh\nexit 0\n", "utf8");
  await fs.chmod(fakeNodePath, 0o755);

  return {
    projectRoot,
    fakeNodePath
  };
}

test("buildMacosBundle creates a distributable directory with bundled runtime and launchers", async () => {
  const workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), "codex-local-proxy-dist-"));
  const { projectRoot, fakeNodePath } = await createFixtureProject();

  try {
    const bundlePath = await buildMacosBundle({
      projectRoot,
      distRoot: workspaceRoot,
      nodeBinaryPath: fakeNodePath
    });

    assert.equal(path.basename(bundlePath), "codex-local-proxy-macos-v9.9.9");
    assert.match(
      await fs.readFile(path.join(bundlePath, "package.json"), "utf8"),
      /"version": "9.9.9"/
    );
    assert.match(
      await fs.readFile(path.join(bundlePath, "runtime", "bin", "node"), "utf8"),
      /exit 0/
    );
    assert.match(
      await fs.readFile(path.join(bundlePath, "app", "src", "server.js"), "utf8"),
      /server/
    );
    assert.match(
      await fs.readFile(path.join(bundlePath, "app", "scripts", "init-config.js"), "utf8"),
      /init/
    );
    const startLauncher = await fs.readFile(
      path.join(bundlePath, "bin", "start.command"),
      "utf8"
    );
    assert.match(startLauncher, /runtime\/bin\/node/);
    assert.match(startLauncher, /codex-local-proxy\.pid/);
    assert.match(startLauncher, /HTTP_PROXY=.*127\.0\.0\.1:7897/);
    assert.match(startLauncher, /HTTPS_PROXY=.*127\.0\.0\.1:7897/);
    assert.match(startLauncher, /NO_PROXY=.*127\.0\.0\.1.*localhost/);
    assert.match(startLauncher, /"\$NODE_BIN" --use-env-proxy "\$APP_DIR\/src\/server\.js"/);
    assert.match(
      await fs.readFile(path.join(bundlePath, "bin", "start-preview.command"), "utf8"),
      /CODEX_ROUTER_PORT=3457/
    );
    assert.match(
      await fs.readFile(path.join(bundlePath, "bin", "open-dashboard.command"), "utf8"),
      /http:\/\/127\.0\.0\.1:3456\//
    );

    const startStat = await fs.stat(path.join(bundlePath, "bin", "start.command"));
    assert.ok((startStat.mode & 0o111) !== 0);
  } finally {
    await fs.rm(workspaceRoot, { recursive: true, force: true });
    await fs.rm(projectRoot, { recursive: true, force: true });
  }
});
