import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { saveConfig } from "../src/config.js";
import { handleRouterHttp } from "../src/server.js";

const SAMPLE_CODEX_CONFIG = `model_provider = "OpenAI"

[model_providers.OpenAI]
base_url = "http://127.0.0.1:3456/v1"
name = "OpenAI"
requires_openai_auth = true
wire_api = "responses"
`;

async function withHomes(fn) {
  const routerHome = await fs.mkdtemp(path.join(os.tmpdir(), "codex-router-mode-"));
  const codexHome = await fs.mkdtemp(path.join(os.tmpdir(), "codex-home-mode-"));

  await saveConfig({
    listenHost: "127.0.0.1",
    listenPort: 3456,
    connectionMode: "proxy",
    defaultPlatform: "cdapi",
    upstreams: {
      openapi: {
        baseUrl: "https://api.openai.com/v1",
        apiKey: ""
      },
      cdapi: {
        baseUrl: "https://coding.caodong.host/v1",
        apiKey: "cd-key"
      },
      ttapi: {
        baseUrl: "https://w.ciykj.cn",
        apiKey: "tt-key"
      }
    },
    projectRoutes: []
  }, routerHome);

  await fs.writeFile(path.join(codexHome, "config.toml"), SAMPLE_CODEX_CONFIG, "utf8");

  try {
    await fn({ routerHome, codexHome });
  } finally {
    await fs.rm(routerHome, { recursive: true, force: true });
    await fs.rm(codexHome, { recursive: true, force: true });
  }
}

test("status endpoint reports configured connection mode and codex connection", async () => {
  await withHomes(async ({ routerHome, codexHome }) => {
    const result = await handleRouterHttp({
      method: "GET",
      url: "/_router/status",
      routerHome,
      codexHome
    });

    assert.equal(result.statusCode, 200);
    assert.equal(result.payload.connectionMode, "proxy");
    assert.equal(result.payload.codexConnection.mode, "proxy");
    assert.equal(result.payload.codexConnection.baseUrl, "http://127.0.0.1:3456/v1");
  });
});

test("clear-proxy endpoint removes local proxy base_url from codex config", async () => {
  await withHomes(async ({ routerHome, codexHome }) => {
    const result = await handleRouterHttp({
      method: "POST",
      url: "/_router/clear-proxy",
      headers: {
        "content-type": "application/json"
      },
      routerHome,
      codexHome
    });

    assert.equal(result.statusCode, 200);
    assert.equal(result.payload.codexConnection.mode, "unknown");
    assert.doesNotMatch(
      await fs.readFile(path.join(codexHome, "config.toml"), "utf8"),
      /base_url = /
    );

    const backupDir = path.join(routerHome, "backups");
    const backupFiles = await fs.readdir(backupDir);
    assert.equal(backupFiles.length, 1);
    assert.match(backupFiles[0], /^codex-config-\d{8}T\d{6}\d{3}Z\.toml$/);
    assert.match(
      await fs.readFile(path.join(backupDir, backupFiles[0]), "utf8"),
      /base_url = "http:\/\/127\.0\.0\.1:3456\/v1"/
    );
  });
});

test("toggle-proxy endpoint clears the local proxy binding when Codex is already attached", async () => {
  await withHomes(async ({ routerHome, codexHome }) => {
    const result = await handleRouterHttp({
      method: "POST",
      url: "/_router/toggle-proxy",
      headers: {
        "content-type": "application/json"
      },
      routerHome,
      codexHome
    });

    assert.equal(result.statusCode, 200);
    assert.equal(result.payload.codexConnection.mode, "unknown");
    assert.doesNotMatch(
      await fs.readFile(path.join(codexHome, "config.toml"), "utf8"),
      /base_url = /
    );
  });
});

test("clear-proxy endpoint is idempotent when local proxy is already removed", async () => {
  await withHomes(async ({ routerHome, codexHome }) => {
    await handleRouterHttp({
      method: "POST",
      url: "/_router/clear-proxy",
      headers: {
        "content-type": "application/json"
      },
      routerHome,
      codexHome
    });

    const result = await handleRouterHttp({
      method: "POST",
      url: "/_router/clear-proxy",
      headers: {
        "content-type": "application/json"
      },
      routerHome,
      codexHome
    });

    assert.equal(result.statusCode, 200);
    assert.equal(result.payload.codexConnection.mode, "unknown");
    assert.doesNotMatch(
      await fs.readFile(path.join(codexHome, "config.toml"), "utf8"),
      /base_url = /
    );
  });
});

test("toggle-proxy endpoint re-attaches Codex to the local proxy when binding is removed", async () => {
  await withHomes(async ({ routerHome, codexHome }) => {
    await handleRouterHttp({
      method: "POST",
      url: "/_router/clear-proxy",
      headers: {
        "content-type": "application/json"
      },
      routerHome,
      codexHome
    });

    const result = await handleRouterHttp({
      method: "POST",
      url: "/_router/toggle-proxy",
      headers: {
        "content-type": "application/json"
      },
      routerHome,
      codexHome
    });

    assert.equal(result.statusCode, 200);
    assert.equal(result.payload.codexConnection.mode, "proxy");
    assert.match(
      await fs.readFile(path.join(codexHome, "config.toml"), "utf8"),
      /base_url = "http:\/\/127\.0\.0\.1:3456\/v1"/
    );
  });
});
