import test from "node:test";
import assert from "node:assert/strict";

import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { saveConfig } from "../src/config.js";
import { formatListenError, handleRouterHttp, resolveListenOptions } from "../src/server.js";

test("resolveListenOptions prefers preview environment overrides", () => {
  const previousPort = process.env.CODEX_ROUTER_PORT;
  const previousHost = process.env.CODEX_ROUTER_HOST;

  process.env.CODEX_ROUTER_PORT = "3457";
  process.env.CODEX_ROUTER_HOST = "127.0.0.1";

  try {
    const result = resolveListenOptions({}, {
      listenHost: "127.0.0.1",
      listenPort: 3456
    });

    assert.deepEqual(result, {
      port: 3457,
      host: "127.0.0.1"
    });
  } finally {
    if (previousPort == null) {
      delete process.env.CODEX_ROUTER_PORT;
    } else {
      process.env.CODEX_ROUTER_PORT = previousPort;
    }

    if (previousHost == null) {
      delete process.env.CODEX_ROUTER_HOST;
    } else {
      process.env.CODEX_ROUTER_HOST = previousHost;
    }
  }
});

test("status endpoint reports preview listen port when environment override is active", async () => {
  const previousPort = process.env.CODEX_ROUTER_PORT;
  const routerHome = await fs.mkdtemp(path.join(os.tmpdir(), "codex-router-preview-status-"));

  process.env.CODEX_ROUTER_PORT = "3457";

  try {
    await saveConfig({
      listenHost: "127.0.0.1",
      listenPort: 3456,
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

    const result = await handleRouterHttp({
      method: "GET",
      url: "/_router/status",
      routerHome
    });

    assert.equal(result.statusCode, 200);
    assert.equal(result.payload.listenPort, 3457);
  } finally {
    if (previousPort == null) {
      delete process.env.CODEX_ROUTER_PORT;
    } else {
      process.env.CODEX_ROUTER_PORT = previousPort;
    }

    await fs.rm(routerHome, { recursive: true, force: true });
  }
});

test("formatListenError reports a clear error when the listen port is already in use", () => {
  const error = Object.assign(new Error("listen EADDRINUSE"), {
    code: "EADDRINUSE"
  });

  const result = formatListenError(error, {
    host: "127.0.0.1",
    port: 3456
  });

  assert.equal(result.code, "EADDRINUSE");
  assert.match(result.message, /127\.0\.0\.1:3456/);
  assert.match(result.message, /already in use/i);
});
