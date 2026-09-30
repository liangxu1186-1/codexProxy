import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { saveConfig, loadConfig } from "../src/config.js";
import { runCli } from "../src/cli.js";
import { handleRouterHttp } from "../src/server.js";

async function withTempRouterHome(fn) {
  const routerHome = await fs.mkdtemp(path.join(os.tmpdir(), "codex-router-test-"));
  const codexHome = await fs.mkdtemp(path.join(os.tmpdir(), "codex-home-test-"));

  await saveConfig(
    {
      connectionMode: "proxy",
      defaultPlatform: "openapi",
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
      projectRoutes: [
        {
          path: "/Users/shouqianba/Desktop/liangxu/code2/kaci-om-platform-ic",
          platform: "cdapi"
        }
      ]
    },
    routerHome
  );
  await fs.writeFile(path.join(codexHome, "config.toml"), `model_provider = "OpenAI"

[model_providers.OpenAI]
base_url = "http://127.0.0.1:3456/v1"
name = "OpenAI"
requires_openai_auth = true
wire_api = "responses"
`, "utf8");

  try {
    await fn(routerHome, codexHome);
  } finally {
    await fs.rm(routerHome, { recursive: true, force: true });
    await fs.rm(codexHome, { recursive: true, force: true });
  }
}

function createOutputCollector() {
  const lines = [];

  return {
    lines,
    write(line) {
      lines.push(line);
    }
  };
}

function createFetchImpl(routerHome, codexHome) {
  return async (url, init = {}) => {
    const resolvedUrl = new URL(url, "http://127.0.0.1");
    const result = await handleRouterHttp({
      method: init.method || "GET",
      url: `${resolvedUrl.pathname}${resolvedUrl.search}`,
      headers: init.headers || {},
      body: init.body ? Buffer.from(init.body) : Buffer.alloc(0),
      routerHome,
      codexHome
    });

    return {
      ok: result.statusCode >= 200 && result.statusCode < 300,
      status: result.statusCode,
      async json() {
        return result.payload;
      }
    };
  };
}

test("status endpoint reports default and resolved platform", async () => {
  await withTempRouterHome(async (routerHome, codexHome) => {
    const result = await handleRouterHttp({
      method: "GET",
      url: `/_router/status?path=${encodeURIComponent("/Users/shouqianba/Desktop/liangxu/code2/kaci-om-platform-ic/docs")}`,
      routerHome,
      codexHome
    });

    assert.equal(result.statusCode, 200);
    assert.equal(result.payload.defaultPlatform, "cdapi");
    assert.equal(result.payload.resolved.platform, "cdapi");
    assert.equal(result.payload.resolved.reason, "projectRoute");
  });
});

test("default-platform endpoint persists the global platform selection", async () => {
  await withTempRouterHome(async (routerHome, codexHome) => {
    const setResult = await handleRouterHttp({
      method: "POST",
      url: "/_router/default-platform",
      headers: {
        "content-type": "application/json"
      },
      body: Buffer.from(JSON.stringify({ platform: "ttapi" })),
      routerHome,
      codexHome
    });

    assert.equal(setResult.statusCode, 200);
    assert.equal((await loadConfig(routerHome)).defaultPlatform, "ttapi");

    const statusResult = await handleRouterHttp({
      method: "GET",
      url: `/_router/status?path=${encodeURIComponent("/Users/shouqianba/Desktop/liangxu/code2/kaci-om-platform-ic/docs")}`,
      routerHome,
      codexHome
    });

    assert.equal(statusResult.payload.defaultPlatform, "ttapi");
    assert.equal(statusResult.payload.resolved.platform, "cdapi");
    assert.equal(statusResult.payload.resolved.reason, "projectRoute");
  });
});

test("default-platform endpoint rejects unavailable platform", async () => {
  await withTempRouterHome(async (routerHome, codexHome) => {
    const setResult = await handleRouterHttp({
      method: "POST",
      url: "/_router/default-platform",
      headers: {
        "content-type": "application/json"
      },
      body: Buffer.from(JSON.stringify({ platform: "openapi" })),
      routerHome,
      codexHome
    });

    assert.equal(setResult.statusCode, 400);
    assert.match(setResult.payload.error, /available/i);
    assert.equal((await loadConfig(routerHome)).defaultPlatform, "openapi");
  });
});

test("cli status/use/resolve commands talk to the local proxy", async () => {
  await withTempRouterHome(async (routerHome, codexHome) => {
    const fetchImpl = createFetchImpl(routerHome, codexHome);
    const stdout = createOutputCollector();

    await runCli(["status", "/Users/shouqianba/Desktop/liangxu/code2/kaci-om-platform-ic"], {
      baseUrl: "http://127.0.0.1:3456",
      fetchImpl,
      stdout
    });
    await runCli(["use", "ttapi"], {
      baseUrl: "http://127.0.0.1:3456",
      fetchImpl,
      stdout
    });
    await runCli(["resolve", "/Users/shouqianba/Desktop/liangxu/code2/kaci-om-platform-ic"], {
      baseUrl: "http://127.0.0.1:3456",
      fetchImpl,
      stdout
    });

    const mergedOutput = stdout.lines.join("\n");
    assert.match(mergedOutput, /"platform": "cdapi"/);
    assert.match(mergedOutput, /"defaultPlatform": "ttapi"/);
    assert.match(mergedOutput, /"reason": "projectRoute"/);
  });
});

test("cli clear-proxy command clears the local proxy binding", async () => {
  await withTempRouterHome(async (routerHome, codexHome) => {
    const fetchImpl = createFetchImpl(routerHome, codexHome);
    const stdout = createOutputCollector();

    await runCli(["clear-proxy"], {
      baseUrl: "http://127.0.0.1:3456",
      fetchImpl,
      stdout
    });

    const mergedOutput = stdout.lines.join("\n");
    assert.match(mergedOutput, /"mode": "unknown"/);
  });
});

test("cli map and unmap modify project routing config without touching Codex config files", async () => {
  await withTempRouterHome(async (routerHome) => {
    const stdout = createOutputCollector();
    const targetPath = "/Users/shouqianba/Desktop/liangxu/code2/codexProxy";

    await runCli(["map", targetPath, "ttapi"], {
      routerHome,
      stdout
    });

    let config = await loadConfig(routerHome);
    assert.equal(
      config.projectRoutes.some((route) => route.path === targetPath && route.platform === "ttapi"),
      true
    );

    await runCli(["unmap", targetPath], {
      routerHome,
      stdout
    });

    config = await loadConfig(routerHome);
    assert.equal(config.projectRoutes.some((route) => route.path === targetPath), false);
  });
});

test("upstream endpoints add, update, and delete dynamic platforms", async () => {
  await withTempRouterHome(async (routerHome, codexHome) => {
    const createResult = await handleRouterHttp({
      method: "POST",
      url: "/_router/upstreams",
      headers: {
        "content-type": "application/json"
      },
      body: Buffer.from(JSON.stringify({
        platform: "mirror",
        baseUrl: "https://mirror.example.com/v1",
        apiKey: "mirror-key"
      })),
      routerHome,
      codexHome
    });

    assert.equal(createResult.statusCode, 200);
    assert.equal(createResult.payload.upstreams.mirror.baseUrl, "https://mirror.example.com/v1");
    assert.equal(createResult.payload.routablePlatforms.includes("mirror"), true);

    const updateResult = await handleRouterHttp({
      method: "PUT",
      url: "/_router/upstreams/mirror",
      headers: {
        "content-type": "application/json"
      },
      body: Buffer.from(JSON.stringify({
        baseUrl: "https://mirror.example.com/openai",
        apiKey: "mirror-key-2"
      })),
      routerHome,
      codexHome
    });

    assert.equal(updateResult.statusCode, 200);
    assert.equal(updateResult.payload.upstreams.mirror.baseUrl, "https://mirror.example.com/openai");

    const deleteResult = await handleRouterHttp({
      method: "DELETE",
      url: "/_router/upstreams/mirror",
      routerHome,
      codexHome
    });

    assert.equal(deleteResult.statusCode, 200);
    assert.equal(deleteResult.payload.upstreams.mirror, undefined);
    assert.equal(deleteResult.payload.supportedPlatforms.includes("mirror"), false);
  });
});

test("deleting the default built-in platform does not restore it and falls back to another routable platform", async () => {
  await withTempRouterHome(async (routerHome, codexHome) => {
    const deleteResult = await handleRouterHttp({
      method: "DELETE",
      url: "/_router/upstreams/cdapi",
      routerHome,
      codexHome
    });

    assert.equal(deleteResult.statusCode, 200);
    assert.equal(deleteResult.payload.defaultPlatform, "ttapi");
    assert.equal(deleteResult.payload.supportedPlatforms.includes("cdapi"), false);
    assert.equal(deleteResult.payload.upstreams.cdapi, undefined);

    const persisted = await loadConfig(routerHome);
    assert.equal(persisted.defaultPlatform, "ttapi");
    assert.equal("cdapi" in persisted.upstreams, false);
  });
});
