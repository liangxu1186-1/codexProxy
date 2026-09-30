import test from "node:test";
import assert from "node:assert/strict";
import { PassThrough } from "node:stream";
import { text } from "node:stream/consumers";

import { forwardToUpstream } from "../src/upstream.js";

class MockResponse extends PassThrough {
  writeHead(statusCode, headers) {
    this.statusCode = statusCode;
    this.headers = headers;
    return this;
  }
}

class EarlyFinishResponse extends PassThrough {
  writeHead(statusCode, headers) {
    this.statusCode = statusCode;
    this.headers = headers;
    setImmediate(() => this.emit("finish"));
    return this;
  }
}

const config = {
  defaultPlatform: "openapi",
  upstreams: {
    openapi: {
      baseUrl: "https://api.openai.com/v1",
      apiKey: "open-key"
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

test("forwards request to resolved upstream and injects platform API key", async () => {
  let captured;
  const response = new MockResponse();
  const body = Buffer.from(JSON.stringify({ model: "gpt-5.4", input: "hi" }));

  await forwardToUpstream({
    request: {
      method: "POST",
      url: "/v1/responses",
      headers: {
        "content-type": "application/json",
        authorization: "Bearer should-not-pass-through"
      }
    },
    response,
    config,
    body,
    projectPathInfo: {
      path: "/Users/shouqianba/Desktop/liangxu/code2/kaci-om-platform-ic"
    },
    fetchImpl: async (url, init) => {
      captured = { url, init };

      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: {
          "content-type": "application/json"
        }
      });
    }
  });

  assert.equal(captured.url, "https://coding.caodong.host/v1/responses");
  assert.equal(captured.init.headers.authorization, "Bearer cd-key");
  assert.equal(captured.init.headers["content-type"], "application/json");
  assert.equal(captured.init.body.toString("utf8"), body.toString("utf8"));
  assert.equal(response.statusCode, 200);
  assert.equal(response.headers["x-codex-router-platform"], "cdapi");
  assert.equal(await text(response), JSON.stringify({ ok: true }));
});

test("project route beats default platform and preserves upstream content type", async () => {
  let captured;
  const response = new MockResponse();

  await forwardToUpstream({
    request: {
      method: "GET",
      url: "/v1/models",
      headers: {
        accept: "application/json"
      }
    },
    response,
    config,
    body: Buffer.alloc(0),
    projectPathInfo: {
      path: "/Users/shouqianba/Desktop/liangxu/code2/kaci-om-platform-ic"
    },
    fetchImpl: async (url, init) => {
      captured = { url, init };

      return new Response(JSON.stringify({ data: [{ id: "model-a" }] }), {
        status: 200,
        headers: {
          "content-type": "application/json",
          "x-upstream-header": "kept"
        }
      });
    }
  });

  assert.equal(captured.url, "https://coding.caodong.host/v1/models");
  assert.equal(captured.init.headers.authorization, "Bearer cd-key");
  assert.equal(response.headers["content-type"], "application/json");
  assert.equal(response.headers["x-upstream-header"], "kept");
  assert.equal(response.headers["x-codex-router-reason"], "projectRoute");
});

test("fails over to the next available upstream on retryable upstream status", async () => {
  const response = new MockResponse();
  const calls = [];

  await forwardToUpstream({
    request: {
      method: "GET",
      url: "/v1/models",
      headers: {
        accept: "application/json"
      }
    },
    response,
    config: {
      ...config,
      defaultPlatform: "ttapi",
      projectRoutes: []
    },
    body: Buffer.alloc(0),
    projectPathInfo: null,
    fetchImpl: async (url, init) => {
      calls.push({ url, init });

      if (calls.length === 1) {
        return new Response(JSON.stringify({ error: "bad gateway" }), {
          status: 502,
          headers: {
            "content-type": "application/json"
          }
        });
      }

      return new Response(JSON.stringify({ data: [{ id: "fallback-model" }] }), {
        status: 200,
        headers: {
          "content-type": "application/json"
        }
      });
    }
  });

  assert.equal(calls.length, 2);
  assert.equal(calls[0].url, "https://w.ciykj.cn/v1/models");
  assert.equal(calls[1].url, "https://api.openai.com/v1/models");
  assert.equal(response.statusCode, 200);
  assert.equal(response.headers["x-codex-router-platform"], "openapi");
  assert.equal(response.headers["x-codex-router-primary-platform"], "ttapi");
  assert.equal(response.headers["x-codex-router-failover"], "true");
});

test("does not fail over on client error responses", async () => {
  const response = new MockResponse();
  const calls = [];

  await forwardToUpstream({
    request: {
      method: "GET",
      url: "/v1/models",
      headers: {
        accept: "application/json"
      }
    },
    response,
    config: {
      ...config,
      defaultPlatform: "ttapi",
      projectRoutes: []
    },
    body: Buffer.alloc(0),
    projectPathInfo: null,
    fetchImpl: async (url, init) => {
      calls.push({ url, init });

      return new Response(JSON.stringify({ error: "bad request" }), {
        status: 400,
        headers: {
          "content-type": "application/json"
        }
      });
    }
  });

  assert.equal(calls.length, 1);
  assert.equal(response.statusCode, 400);
  assert.equal(response.headers["x-codex-router-platform"], "ttapi");
  assert.equal(response.headers["x-codex-router-failover"], "false");
});

test("skips unavailable default platform and forwards to the first routable upstream", async () => {
  const response = new MockResponse();
  const calls = [];

  await forwardToUpstream({
    request: {
      method: "GET",
      url: "/v1/models",
      headers: {
        accept: "application/json"
      }
    },
    response,
    config: {
      ...config,
      defaultPlatform: "openapi",
      upstreams: {
        ...config.upstreams,
        openapi: {
          ...config.upstreams.openapi,
          apiKey: ""
        }
      },
      projectRoutes: []
    },
    body: Buffer.alloc(0),
    projectPathInfo: null,
    fetchImpl: async (url) => {
      calls.push(url);

      return new Response(JSON.stringify({ data: [{ id: "model-a" }] }), {
        status: 200,
        headers: {
          "content-type": "application/json"
        }
      });
    }
  });

  assert.deepEqual(calls, ["https://coding.caodong.host/v1/models"]);
  assert.equal(response.statusCode, 200);
  assert.equal(response.headers["x-codex-router-platform"], "cdapi");
  assert.equal(response.headers["x-codex-router-primary-platform"], "cdapi");
  assert.equal(response.headers["x-codex-router-failover"], "false");
});

test("records request metadata after forwarding completes", async () => {
  const response = new MockResponse();
  const recorded = [];
  const body = Buffer.from(JSON.stringify({ model: "gpt-5.4", input: "hi" }));

  await forwardToUpstream({
    request: {
      method: "POST",
      url: "/v1/responses",
      headers: {
        "content-type": "application/json"
      }
    },
    response,
    config,
    body,
    projectPathInfo: {
      path: "/Users/shouqianba/Desktop/liangxu/code2/kaci-om-platform-ic"
    },
    onRequestComplete(entry) {
      recorded.push(entry);
    },
    fetchImpl: async () => new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: {
        "content-type": "application/json"
      }
    })
  });

  assert.equal(recorded.length, 1);
  assert.equal(recorded[0].platform, "cdapi");
  assert.equal(recorded[0].primaryPlatform, "cdapi");
  assert.equal(recorded[0].failover, false);
  assert.equal(recorded[0].reason, "projectRoute");
  assert.equal(recorded[0].statusCode, 200);
  assert.equal(recorded[0].method, "POST");
  assert.equal(recorded[0].path, "/v1/responses");
  assert.equal(recorded[0].model, "gpt-5.4");
  assert.equal(typeof recorded[0].durationMs, "number");
});

test("records failover metadata when fallback upstream succeeds", async () => {
  const response = new MockResponse();
  const recorded = [];
  const calls = [];

  await forwardToUpstream({
    request: {
      method: "GET",
      url: "/v1/models",
      headers: {
        accept: "application/json"
      }
    },
    response,
    config: {
      ...config,
      defaultPlatform: "ttapi",
      projectRoutes: []
    },
    body: Buffer.alloc(0),
    projectPathInfo: null,
    onRequestComplete(entry) {
      recorded.push(entry);
    },
    fetchImpl: async (url) => {
      calls.push(url);

      if (calls.length === 1) {
        return new Response(JSON.stringify({ error: "bad gateway" }), {
          status: 502,
          headers: {
            "content-type": "application/json"
          }
        });
      }

      return new Response(JSON.stringify({ data: [{ id: "fallback-model" }] }), {
        status: 200,
        headers: {
          "content-type": "application/json"
        }
      });
    }
  });

  assert.equal(recorded.length, 1);
  assert.equal(recorded[0].primaryPlatform, "ttapi");
  assert.equal(recorded[0].platform, "openapi");
  assert.equal(recorded[0].failover, true);
  assert.equal(recorded[0].attempts.length, 2);
  assert.equal(recorded[0].attempts[0].platform, "ttapi");
  assert.equal(recorded[0].attempts[0].statusCode, 502);
  assert.equal(recorded[0].attempts[1].platform, "openapi");
  assert.equal(recorded[0].attempts[1].statusCode, 200);
});

test("handles upstream stream termination without leaving an unhandled response stream error", async () => {
  const response = new MockResponse();
  const recorded = [];
  const streamErrors = [];
  response.on("error", (error) => {
    streamErrors.push(error);
  });

  const upstreamBody = new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode("{\"partial\":true}"));
      queueMicrotask(() => {
        controller.error(new TypeError("terminated"));
      });
    }
  });

  await assert.rejects(
    forwardToUpstream({
      request: {
        method: "GET",
        url: "/v1/responses",
        headers: {
          accept: "application/json"
        }
      },
      response,
      config: {
        ...config,
        defaultPlatform: "cdapi",
        projectRoutes: []
      },
      body: Buffer.alloc(0),
      projectPathInfo: null,
      onRequestComplete(entry) {
        recorded.push(entry);
      },
      fetchImpl: async () => new Response(upstreamBody, {
        status: 200,
        headers: {
          "content-type": "application/json"
        }
      })
    }),
    /terminated/
  );

  assert.equal(streamErrors.length, 1);
  assert.equal(streamErrors[0].message, "terminated");
  assert.equal(recorded.length, 1);
  assert.equal(recorded[0].platform, "cdapi");
  assert.equal(recorded[0].statusCode, 502);
  assert.equal(recorded[0].errorMessage, "terminated");
});

test("keeps observing upstream body errors after the downstream response finishes", async () => {
  const response = new EarlyFinishResponse();
  response.on("error", () => {});
  const upstreamBody = new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode("partial"));
      setTimeout(() => controller.error(new TypeError("late terminated")), 10);
    }
  });

  await assert.rejects(
    forwardToUpstream({
      request: {
        method: "GET",
        url: "/v1/responses",
        headers: {}
      },
      response,
      config,
      body: Buffer.alloc(0),
      projectPathInfo: null,
      fetchImpl: async () => new Response(upstreamBody, { status: 200 })
    }),
    /late terminated/
  );
});
