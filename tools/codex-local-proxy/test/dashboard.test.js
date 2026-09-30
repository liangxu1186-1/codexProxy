import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { saveConfig } from "../src/config.js";
import { createRequestLog } from "../src/request-log.js";
import { handleRouterHttp } from "../src/server.js";

async function withTempRouterHome(fn) {
  const routerHome = await fs.mkdtemp(path.join(os.tmpdir(), "codex-router-dashboard-"));

  await saveConfig(
    {
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
      projectRoutes: [
        {
          path: "/Users/shouqianba/Desktop/liangxu/code2/kaci-om-platform-ic",
          platform: "cdapi"
        }
      ]
    },
    routerHome
  );

  try {
    await fn(routerHome);
  } finally {
    await fs.rm(routerHome, { recursive: true, force: true });
  }
}

test("GET / serves the router dashboard page", async () => {
  await withTempRouterHome(async (routerHome) => {
    const result = await handleRouterHttp({
      method: "GET",
      url: "/",
      routerHome
    });

    assert.equal(result.kind, "text");
    assert.equal(result.statusCode, 200);
    assert.equal(result.contentType, "text/html; charset=utf-8");
    assert.match(result.body, /Codex 本地代理/);
    assert.match(result.body, /控制台总览/);
    assert.match(result.body, /代理操作/);
    assert.match(result.body, /新增上游/);
    assert.match(result.body, /upstream-modal/);
    assert.match(result.body, /upstream-modal-overlay/);
    assert.match(result.body, /compact-status/);
    assert.match(result.body, /hero-meta/);
    assert.match(result.body, /requests-panel/);
    assert.match(result.body, /switch-actions/);
    assert.match(result.body, /control-matrix/);
    assert.match(result.body, /\/_router\/ui\/app\.js/);
    assert.doesNotMatch(result.body, /操作反馈/);
    assert.doesNotMatch(result.body, /运行模式/);
    assert.doesNotMatch(result.body, /官方直连/);
    assert.doesNotMatch(result.body, /Industrial Control Console/);
    assert.doesNotMatch(result.body, /GLOBAL ROUTE/);
    assert.doesNotMatch(result.body, /UPSTREAMS/);
    assert.doesNotMatch(result.body, /Console/);
    assert.doesNotMatch(result.body, /Mode/);
    assert.doesNotMatch(result.body, /Rack/);
    assert.doesNotMatch(result.body, /Log/);
    assert.doesNotMatch(result.body, /Recent/);
    assert.doesNotMatch(result.body, /路径命中测试/);
    assert.doesNotMatch(result.body, /项目路由列表/);
    assert.doesNotMatch(result.body, /临时覆盖/);
    assert.doesNotMatch(result.body, /清除覆盖/);
    assert.doesNotMatch(result.body, /配置编辑/);
  });
});

test("HEAD / returns the dashboard content type", async () => {
  await withTempRouterHome(async (routerHome) => {
    const result = await handleRouterHttp({
      method: "HEAD",
      url: "/",
      routerHome
    });

    assert.equal(result.kind, "text");
    assert.equal(result.statusCode, 200);
    assert.equal(result.contentType, "text/html; charset=utf-8");
  });
});

test("GET /_router/ui/app.js serves the dashboard script", async () => {
  await withTempRouterHome(async (routerHome) => {
    const result = await handleRouterHttp({
      method: "GET",
      url: "/_router/ui/app.js",
      routerHome
    });

    assert.equal(result.kind, "text");
    assert.equal(result.statusCode, 200);
    assert.equal(result.contentType, "text/javascript; charset=utf-8");
    assert.match(result.body, /fetchStatus/);
    assert.match(result.body, /fetchRequests/);
    assert.match(result.body, /\/_router\/requests\?limit=10/);
    assert.match(result.body, /\/_router\/status/);
    assert.match(result.body, /\/_router\/requests/);
    assert.match(result.body, /\/_router\/default-platform/);
    assert.match(result.body, /\/_router\/toggle-proxy/);
    assert.match(result.body, /\/_router\/upstreams/);
    assert.match(result.body, /renderSwitchboard/);
    assert.match(result.body, /submitUpstreamForm/);
    assert.match(result.body, /deleteUpstream/);
    assert.match(result.body, /openDeleteConfirmModal/);
    assert.match(result.body, /closeDeleteConfirmModal/);
    assert.match(result.body, /delete-confirm-modal/);
    assert.match(result.body, /delete-confirm-overlay/);
    assert.doesNotMatch(result.body, /window\.confirm/);
    assert.match(result.body, /确认删除上游/);
    assert.match(result.body, /openUpstreamModal/);
    assert.match(result.body, /closeUpstreamModal/);
    assert.match(result.body, /Escape/);
    assert.match(result.body, /当前 Codex 仍经过本地代理/);
    assert.match(result.body, /当前 Codex 已接入本地代理，点击后会清除当前绑定。/);
    assert.match(result.body, /当前 Codex 未经过本地代理，点击后会重新接回当前监听地址。/);
    assert.match(result.body, /不可用/);
    assert.match(result.body, /button\.disabled/);
    assert.doesNotMatch(result.body, /\/_router\/connection-mode/);
    assert.doesNotMatch(result.body, /\/_router\/override/);
  });
});

test("GET /_router/requests returns recent request records", async () => {
  await withTempRouterHome(async (routerHome) => {
    const requestLog = createRequestLog();
    requestLog.add({
      id: "req-1",
      primaryPlatform: "ttapi",
      platform: "ttapi",
      reason: "default",
      failover: false,
      attempts: [
        {
          platform: "ttapi",
          statusCode: 200
        }
      ],
      method: "POST",
      path: "/v1/responses",
      model: "gpt-5.4",
      statusCode: 200,
      durationMs: 1240,
      createdAt: "2026-04-22T10:00:00.000Z"
    });

    const result = await handleRouterHttp({
      method: "GET",
      url: "/_router/requests",
      routerHome,
      requestLog
    });

    assert.equal(result.kind, "json");
    assert.equal(result.statusCode, 200);
    assert.equal(result.payload.items.length, 1);
    assert.equal(result.payload.items[0].platform, "ttapi");
    assert.equal(result.payload.items[0].statusCode, 200);
  });
});
