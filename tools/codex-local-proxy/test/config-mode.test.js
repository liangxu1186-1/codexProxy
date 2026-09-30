import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { getConfigPath, loadConfig, normalizeConfig } from "../src/config.js";

test("normalizeConfig defaults connectionMode to proxy", () => {
  const result = normalizeConfig({
    defaultPlatform: "cdapi"
  });

  assert.equal(result.connectionMode, "proxy");
});

test("loadConfig auto-creates default config when config file is missing", async () => {
  const routerHome = await fs.mkdtemp(path.join(os.tmpdir(), "codex-router-config-"));

  try {
    const result = await loadConfig(routerHome);

    assert.equal(result.defaultPlatform, "cdapi");
    assert.equal(result.connectionMode, "proxy");

    const persisted = JSON.parse(await fs.readFile(getConfigPath(routerHome), "utf8"));
    assert.equal(persisted.defaultPlatform, "cdapi");
    assert.equal(persisted.connectionMode, "proxy");
  } finally {
    await fs.rm(routerHome, { recursive: true, force: true });
  }
});
