import test from "node:test";
import assert from "node:assert/strict";

import {
  extractProjectPath,
  listSupportedPlatforms,
  pickDefaultPlatform,
  resolveRoute
} from "../src/router.js";

const config = {
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
};

test("project route beats default when path matches", () => {
  const result = resolveRoute({
    config,
    projectPath: "/Users/shouqianba/Desktop/liangxu/code2/kaci-om-platform-ic/tools"
  });

  assert.equal(result.platform, "cdapi");
  assert.equal(result.reason, "projectRoute");
});

test("unknown path falls back to default", () => {
  const result = resolveRoute({
    config,
    projectPath: "/Users/shouqianba/Desktop/liangxu/code2/other-project"
  });

  assert.equal(result.platform, "cdapi");
  assert.equal(result.reason, "default");
});

test("project route falls back to routable default when mapped platform is unavailable", () => {
  const result = resolveRoute({
    config: {
      ...config,
      projectRoutes: [
        {
          path: "/Users/shouqianba/Desktop/liangxu/code2/codexProxy",
          platform: "openapi"
        }
      ]
    },
    projectPath: "/Users/shouqianba/Desktop/liangxu/code2/codexProxy/tools"
  });

  assert.equal(result.platform, "cdapi");
  assert.equal(result.reason, "default");
});

test("extracts project path from router header before parsing body", () => {
  const request = {
    headers: {
      "x-codex-project-path": "/Users/shouqianba/Desktop/liangxu/code2/kaci-om-platform-ic"
    }
  };

  const result = extractProjectPath(request, JSON.stringify({ cwd: "/tmp/ignored" }));

  assert.deepEqual(result, {
    path: "/Users/shouqianba/Desktop/liangxu/code2/kaci-om-platform-ic",
    source: "header:x-codex-project-path"
  });
});

test("extracts project path from JSON body when headers are absent", () => {
  const request = { headers: {} };

  const result = extractProjectPath(
    request,
    JSON.stringify({
      metadata: {
        workspaceRoot: "/Users/shouqianba/Desktop/liangxu/code2/kaci-om-platform-ic"
      }
    })
  );

  assert.deepEqual(result, {
    path: "/Users/shouqianba/Desktop/liangxu/code2/kaci-om-platform-ic",
    source: "body:metadata.workspaceRoot"
  });
});

test("supports dynamic upstream collections without restoring deleted built-ins", () => {
  const result = listSupportedPlatforms({
    defaultPlatform: "mirror",
    upstreams: {
      mirror: {
        baseUrl: "https://mirror.example.com/v1",
        apiKey: "mirror-key"
      }
    },
    projectRoutes: []
  });

  assert.deepEqual(result, ["mirror"]);
});

test("falls back to the next routable platform when default platform is deleted", () => {
  const result = pickDefaultPlatform({
    defaultPlatform: "cdapi",
    upstreams: {
      ttapi: {
        baseUrl: "https://w.ciykj.cn",
        apiKey: "tt-key"
      },
      mirror: {
        baseUrl: "https://mirror.example.com/v1",
        apiKey: ""
      }
    },
    projectRoutes: []
  });

  assert.equal(result, "ttapi");
});
