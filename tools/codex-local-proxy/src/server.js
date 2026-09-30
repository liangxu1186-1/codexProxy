import http from "node:http";

import {
  clearCodexProxyBaseUrl,
  readCodexConnectionState,
  syncCodexConnectionMode
} from "./codex-config.js";
import { loadConfig, saveConfig, sanitizeConfig } from "./config.js";
import { getDashboardCss, getDashboardHtml, getDashboardJs } from "./dashboard.js";
import { createRequestLog } from "./request-log.js";
import {
  extractProjectPath,
  isRoutablePlatform,
  listRoutablePlatforms,
  listSupportedPlatforms,
  pickDefaultPlatform,
  resolveRoute
} from "./router.js";
import { forwardToUpstream } from "./upstream.js";

const PLATFORM_NAME_PATTERN = /^[A-Za-z0-9_-]+$/;

function isValidUrl(value) {
  try {
    const parsed = new URL(String(value));
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

function normalizeUpstreamInput(payload = {}) {
  return {
    platform: typeof payload.platform === "string" ? payload.platform.trim() : "",
    baseUrl: typeof payload.baseUrl === "string" ? payload.baseUrl.trim() : "",
    apiKey: typeof payload.apiKey === "string" ? payload.apiKey.trim() : ""
  };
}

function buildUpstreamValidationError(message, config) {
  return {
    kind: "json",
    statusCode: 400,
    payload: {
      error: message,
      supportedPlatforms: listSupportedPlatforms(config),
      routablePlatforms: listRoutablePlatforms(config)
    }
  };
}

function withFallbackDefaultPlatform(config) {
  return {
    ...config,
    defaultPlatform: pickDefaultPlatform(config)
  };
}

function json(response, statusCode, payload) {
  response.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8"
  });
  response.end(JSON.stringify(payload, null, 2));
}

function errorJson(response, statusCode, message, extra = {}) {
  json(response, statusCode, {
    error: message,
    ...extra
  });
}

export function handleRequestError(response, error) {
  if (response.headersSent || response.writableEnded) {
    if (!response.destroyed && !response.writableEnded) {
      response.destroy(error);
    }
    return;
  }

  errorJson(response, error.statusCode || 500, error.message || "Unexpected server error");
}

function text(response, statusCode, contentType, body) {
  response.writeHead(statusCode, {
    "content-type": contentType
  });
  if (response.req?.method === "HEAD") {
    response.end();
    return;
  }

  response.end(body);
}

export function formatListenError(error, listenOptions = {}) {
  if (error?.code !== "EADDRINUSE") {
    return error;
  }

  const host = listenOptions.host || "127.0.0.1";
  const port = listenOptions.port || 3456;
  const wrapped = new Error(
    `Unable to start codex-local-proxy: ${host}:${port} is already in use`
  );

  wrapped.code = error.code;
  wrapped.cause = error;
  return wrapped;
}

async function readRequestBody(request) {
  const chunks = [];

  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  return Buffer.concat(chunks);
}

function parseJsonBody(body) {
  if (!body || body.length === 0) {
    return {};
  }

  return JSON.parse(body.toString("utf8"));
}

function buildStatusPayload({ config, resolved, projectPathInfo, listenOptions, codexConnection }) {
  const sanitized = sanitizeConfig(config);
  const defaultPlatform = pickDefaultPlatform(config);

  return {
    ...sanitized,
    listenHost: listenOptions?.host ?? sanitized.listenHost,
    listenPort: listenOptions?.port ?? sanitized.listenPort,
    configuredDefaultPlatform: sanitized.defaultPlatform,
    defaultPlatform,
    projectRouteCount: sanitized.projectRoutes.length,
    supportedPlatforms: listSupportedPlatforms(config),
    routablePlatforms: listRoutablePlatforms(config),
    codexConnection,
    resolved,
    projectPathSource: projectPathInfo?.source || null
  };
}

export async function handleRouterHttp({
  method,
  url,
  headers = {},
  body = Buffer.alloc(0),
  routerHome,
  codexHome,
  requestLog
}) {
  const requestUrl = new URL(url, `http://${headers.host || "127.0.0.1"}`);
  const config = await loadConfig(routerHome);
  const listenOptions = resolveListenOptions({}, config);

  if ((method === "GET" || method === "HEAD") && requestUrl.pathname === "/") {
    return {
      kind: "text",
      statusCode: 200,
      contentType: "text/html; charset=utf-8",
      body: getDashboardHtml()
    };
  }

  if ((method === "GET" || method === "HEAD") && requestUrl.pathname === "/_router/ui/app.css") {
    return {
      kind: "text",
      statusCode: 200,
      contentType: "text/css; charset=utf-8",
      body: getDashboardCss()
    };
  }

  if ((method === "GET" || method === "HEAD") && requestUrl.pathname === "/_router/ui/app.js") {
    return {
      kind: "text",
      statusCode: 200,
      contentType: "text/javascript; charset=utf-8",
      body: getDashboardJs()
    };
  }

  if (method === "GET" && requestUrl.pathname === "/_router/status") {
    const projectPath = requestUrl.searchParams.get("path");
    const resolved = resolveRoute({ config, projectPath });
    const codexConnection = await readCodexConnectionState({
      codexHome,
      routerConfig: config
    });

    return {
      kind: "json",
      statusCode: 200,
      payload: buildStatusPayload({ config, resolved, listenOptions, codexConnection })
    };
  }

  if (method === "GET" && requestUrl.pathname === "/_router/requests") {
    return {
      kind: "json",
      statusCode: 200,
      payload: {
        items: requestLog?.list(Number(requestUrl.searchParams.get("limit") || 20)) || []
      }
    };
  }

  if (method === "POST" && requestUrl.pathname === "/_router/default-platform") {
    const parsedBody = parseJsonBody(body);

    if (!isRoutablePlatform(parsedBody.platform, config)) {
      return {
        kind: "json",
        statusCode: 400,
        payload: {
          error: "Platform is not available",
          supportedPlatforms: listSupportedPlatforms(config),
          routablePlatforms: listRoutablePlatforms(config)
        }
      };
    }

    const nextConfig = {
      ...config,
      defaultPlatform: parsedBody.platform
    };

    await saveConfig(nextConfig, routerHome);

    return {
      kind: "json",
      statusCode: 200,
      payload: buildStatusPayload({
        config: nextConfig,
        resolved: resolveRoute({ config: nextConfig }),
        listenOptions: resolveListenOptions({}, nextConfig),
        codexConnection: await readCodexConnectionState({
          codexHome,
          routerConfig: nextConfig
        })
      })
    };
  }

  if (method === "POST" && requestUrl.pathname === "/_router/upstreams") {
    const parsedBody = normalizeUpstreamInput(parseJsonBody(body));

    if (!parsedBody.platform) {
      return buildUpstreamValidationError("Missing `platform` in request body", config);
    }

    if (!PLATFORM_NAME_PATTERN.test(parsedBody.platform)) {
      return buildUpstreamValidationError("Platform name only supports letters, numbers, `_`, and `-`", config);
    }

    if (config.upstreams[parsedBody.platform]) {
      return buildUpstreamValidationError("Platform already exists", config);
    }

    if (!isValidUrl(parsedBody.baseUrl)) {
      return buildUpstreamValidationError("`baseUrl` must be a valid http/https URL", config);
    }

    const nextConfig = withFallbackDefaultPlatform({
      ...config,
      upstreams: {
        ...config.upstreams,
        [parsedBody.platform]: {
          baseUrl: parsedBody.baseUrl,
          apiKey: parsedBody.apiKey
        }
      }
    });

    await saveConfig(nextConfig, routerHome);

    return {
      kind: "json",
      statusCode: 200,
      payload: buildStatusPayload({
        config: nextConfig,
        resolved: resolveRoute({ config: nextConfig }),
        listenOptions: resolveListenOptions({}, nextConfig),
        codexConnection: await readCodexConnectionState({
          codexHome,
          routerConfig: nextConfig
        })
      })
    };
  }

  if (method === "PUT" && requestUrl.pathname.startsWith("/_router/upstreams/")) {
    const platform = decodeURIComponent(requestUrl.pathname.slice("/_router/upstreams/".length));
    const parsedBody = normalizeUpstreamInput(parseJsonBody(body));

    if (!config.upstreams[platform]) {
      return {
        kind: "json",
        statusCode: 404,
        payload: {
          error: "Platform not found"
        }
      };
    }

    if (!isValidUrl(parsedBody.baseUrl)) {
      return buildUpstreamValidationError("`baseUrl` must be a valid http/https URL", config);
    }

    const nextConfig = withFallbackDefaultPlatform({
      ...config,
      upstreams: {
        ...config.upstreams,
        [platform]: {
          baseUrl: parsedBody.baseUrl,
          apiKey: parsedBody.apiKey
        }
      }
    });

    await saveConfig(nextConfig, routerHome);

    return {
      kind: "json",
      statusCode: 200,
      payload: buildStatusPayload({
        config: nextConfig,
        resolved: resolveRoute({ config: nextConfig }),
        listenOptions: resolveListenOptions({}, nextConfig),
        codexConnection: await readCodexConnectionState({
          codexHome,
          routerConfig: nextConfig
        })
      })
    };
  }

  if (method === "DELETE" && requestUrl.pathname.startsWith("/_router/upstreams/")) {
    const platform = decodeURIComponent(requestUrl.pathname.slice("/_router/upstreams/".length));

    if (!config.upstreams[platform]) {
      return {
        kind: "json",
        statusCode: 404,
        payload: {
          error: "Platform not found"
        }
      };
    }

    const nextUpstreams = { ...config.upstreams };
    delete nextUpstreams[platform];

    const nextConfig = withFallbackDefaultPlatform({
      ...config,
      upstreams: nextUpstreams
    });

    await saveConfig(nextConfig, routerHome);

    return {
      kind: "json",
      statusCode: 200,
      payload: buildStatusPayload({
        config: nextConfig,
        resolved: resolveRoute({ config: nextConfig }),
        listenOptions: resolveListenOptions({}, nextConfig),
        codexConnection: await readCodexConnectionState({
          codexHome,
          routerConfig: nextConfig
        })
      })
    };
  }

  if (method === "POST" && requestUrl.pathname === "/_router/clear-proxy") {
    const codexConnection = await clearCodexProxyBaseUrl({
      codexHome,
      routerHome,
      routerConfig: config
    });

    return {
      kind: "json",
      statusCode: 200,
      payload: buildStatusPayload({
        config,
        resolved: resolveRoute({ config }),
        listenOptions: resolveListenOptions({}, config),
        codexConnection
      })
    };
  }

  if (method === "POST" && requestUrl.pathname === "/_router/toggle-proxy") {
    const currentConnection = await readCodexConnectionState({
      codexHome,
      routerConfig: config
    });
    const codexConnection = currentConnection.mode === "proxy"
      ? await clearCodexProxyBaseUrl({
        codexHome,
        routerHome,
        routerConfig: config
      })
      : await syncCodexConnectionMode({
        mode: "proxy",
        codexHome,
        routerHome,
        routerConfig: config
      });

    return {
      kind: "json",
      statusCode: 200,
      payload: buildStatusPayload({
        config,
        resolved: resolveRoute({ config }),
        listenOptions: resolveListenOptions({}, config),
        codexConnection
      })
    };
  }

  if (method === "POST" && requestUrl.pathname === "/_router/routes/resolve") {
    const parsedBody = parseJsonBody(body);
    const projectPath = parsedBody.path || null;

    if (!projectPath) {
      return {
        kind: "json",
        statusCode: 400,
        payload: {
          error: "Missing `path` in request body"
        }
      };
    }

    const resolved = resolveRoute({ config, projectPath });

    return {
      kind: "json",
      statusCode: 200,
      payload: {
        path: projectPath,
        resolved
      }
    };
  }

  if (url.startsWith("/v1/")) {
    return {
      kind: "proxy",
      config,
      projectPathInfo: extractProjectPath({ headers }, body)
    };
  }

  return {
    kind: "json",
    statusCode: 404,
    payload: {
      error: "Not found"
    }
  };
}

export function createRouterServer(options = {}) {
  const context = {
    routerHome: options.routerHome,
    codexHome: options.codexHome,
    requestLog: options.requestLog || createRequestLog()
  };

  return http.createServer(async (request, response) => {
    try {
      const body = await readRequestBody(request);
      const result = await handleRouterHttp({
        method: request.method,
        url: request.url,
        headers: request.headers,
        body,
        routerHome: context.routerHome,
        codexHome: context.codexHome,
        requestLog: context.requestLog
      });

      if (result.kind === "json") {
        json(response, result.statusCode, result.payload);
        return;
      }

      if (result.kind === "text") {
        text(response, result.statusCode, result.contentType, result.body);
        return;
      }

      if (result.kind === "proxy") {
        await forwardToUpstream({
          request,
          response,
          config: result.config,
          body,
          projectPathInfo: result.projectPathInfo,
          onRequestComplete(entry) {
            context.requestLog.add(entry);
          }
        });
        return;
      }
    } catch (error) {
      handleRequestError(response, error);
    }
  });
}

export function resolveListenOptions(options = {}, config = {}) {
  return {
    port: Number(options.port ?? process.env.CODEX_ROUTER_PORT ?? config.listenPort),
    host: options.host ?? process.env.CODEX_ROUTER_HOST ?? config.listenHost
  };
}

export async function startRouterServer(options = {}) {
  const server = createRouterServer(options);
  const config = await loadConfig(options.routerHome);
  const listenOptions = resolveListenOptions(options, config);

  await new Promise((resolve, reject) => {
    const onError = (error) => {
      reject(formatListenError(error, listenOptions));
    };

    server.once("error", onError);
    server.listen(listenOptions.port, listenOptions.host, () => {
      server.off("error", onError);
      resolve();
    });
  });

  return server;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  startRouterServer()
    .then((server) => {
      const address = server.address();
      process.stdout.write(`codex-local-proxy listening on http://${address.address}:${address.port}\n`);
    })
    .catch((error) => {
      process.stderr.write(`${error.stack || error.message}\n`);
      process.exitCode = 1;
    });
}
