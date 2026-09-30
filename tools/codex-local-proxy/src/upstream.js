import { Readable } from "node:stream";
import { finished } from "node:stream/promises";

import { isRoutablePlatform, listRoutablePlatforms, resolveRoute } from "./router.js";

const HOP_BY_HOP_HEADERS = new Set([
  "connection",
  "content-length",
  "host",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade"
]);

function toPlainHeaders(headers) {
  const plainHeaders = {};

  for (const [name, value] of Object.entries(headers || {})) {
    if (value == null) {
      continue;
    }

    plainHeaders[name.toLowerCase()] = Array.isArray(value) ? value.join(", ") : String(value);
  }

  return plainHeaders;
}

function filterRequestHeaders(headers, apiKey) {
  const nextHeaders = {};

  for (const [name, value] of Object.entries(toPlainHeaders(headers))) {
    if (HOP_BY_HOP_HEADERS.has(name) || name === "authorization") {
      continue;
    }

    nextHeaders[name] = value;
  }

  if (apiKey) {
    nextHeaders.authorization = `Bearer ${apiKey}`;
  }

  return nextHeaders;
}

function filterResponseHeaders(headers, routeInfo) {
  const nextHeaders = {};

  for (const [name, value] of headers.entries()) {
    if (HOP_BY_HOP_HEADERS.has(name.toLowerCase())) {
      continue;
    }

    nextHeaders[name.toLowerCase()] = value;
  }

  nextHeaders["x-codex-router-platform"] = routeInfo.platform;
  nextHeaders["x-codex-router-primary-platform"] = routeInfo.primaryPlatform;
  nextHeaders["x-codex-router-reason"] = routeInfo.reason;
  nextHeaders["x-codex-router-failover"] = String(routeInfo.failover);

  return nextHeaders;
}

function buildUpstreamUrl(baseUrl, requestUrl) {
  const upstreamUrl = new URL(baseUrl);
  const incomingUrl = new URL(requestUrl, "http://127.0.0.1");
  const upstreamPath = upstreamUrl.pathname === "/" ? "" : upstreamUrl.pathname.replace(/\/$/, "");
  let requestPath = incomingUrl.pathname;

  if (upstreamPath && requestPath === upstreamPath) {
    requestPath = "";
  } else if (upstreamPath && requestPath.startsWith(`${upstreamPath}/`)) {
    requestPath = requestPath.slice(upstreamPath.length);
  }

  upstreamUrl.pathname = `${upstreamPath}${requestPath || ""}` || "/";
  upstreamUrl.search = incomingUrl.search;

  return upstreamUrl.toString();
}

function getDurationMs(startedAt) {
  return Math.max(1, Math.round(performance.now() - startedAt));
}

function getRequestPath(requestUrl) {
  return new URL(requestUrl, "http://127.0.0.1").pathname;
}

function extractModel(body) {
  if (!body || body.length === 0) {
    return null;
  }

  try {
    const parsed = JSON.parse(Buffer.isBuffer(body) ? body.toString("utf8") : String(body));
    return typeof parsed?.model === "string" ? parsed.model : null;
  } catch {
    return null;
  }
}

function buildRequestEntry({
  request,
  body,
  routeInfo,
  statusCode,
  startedAt,
  projectPathInfo,
  errorMessage = null
}) {
  return {
    id: `${Date.now()}-${Math.random().toString(16).slice(2, 10)}`,
    createdAt: new Date().toISOString(),
    method: request.method,
    path: getRequestPath(request.url),
    model: extractModel(body),
    platform: routeInfo.platform,
    primaryPlatform: routeInfo.primaryPlatform,
    reason: routeInfo.reason,
    failover: routeInfo.failover,
    attempts: routeInfo.attempts,
    statusCode,
    durationMs: getDurationMs(startedAt),
    projectPath: projectPathInfo?.path || null,
    errorMessage
  };
}

function isRetryableStatus(statusCode) {
  return statusCode === 408 || statusCode === 429 || statusCode >= 500;
}

function listCandidatePlatforms(config, primaryPlatform) {
  const deduped = [
    isRoutablePlatform(primaryPlatform, config) ? primaryPlatform : null,
    ...listRoutablePlatforms(config)
  ].filter((platform, index, items) => (
    platform && items.indexOf(platform) === index
  ));

  return deduped;
}

function createRouteInfo(resolved, attempts, platform = resolved.platform) {
  return {
    platform,
    primaryPlatform: resolved.platform,
    reason: resolved.reason,
    failover: platform !== resolved.platform,
    attempts
  };
}

function pipeUpstreamBody(upstreamBody, response) {
  const source = Readable.fromWeb(upstreamBody);

  return new Promise((resolve, reject) => {
    let settled = false;

    function finishWithError(error) {
      if (settled) {
        return;
      }
      settled = true;
      source.off("error", onSourceError);
      response.off("error", onResponseError);
      reject(error);
    }

    function finishOk() {
      if (settled) {
        return;
      }
      settled = true;
      source.off("error", onSourceError);
      response.off("error", onResponseError);
      resolve();
    }

    function onSourceError(error) {
      if (!response.destroyed) {
        response.destroy(error);
      }
      finishWithError(error);
    }

    function onResponseError(error) {
      finishWithError(error);
    }

    source.once("error", onSourceError);
    response.once("error", onResponseError);
    source.pipe(response);
    // The downstream response can finish before the upstream body has
    // finished (for example when the client disconnects). Do not remove the
    // upstream error listener at that point: undici may report a delayed
    // socket termination on the body stream, and dropping the listener would
    // crash the proxy with an unhandled `UND_ERR_SOCKET`/`terminated` error.
    finished(source, { readable: true, writable: false }).then(() => {
      if (!settled) {
        finishOk();
      }
    }, finishWithError);
  });
}

export async function forwardToUpstream({
  request,
  response,
  config,
  body,
  projectPathInfo,
  onRequestComplete,
  fetchImpl = fetch
}) {
  const startedAt = performance.now();
  const resolved = resolveRoute({
    config,
    projectPath: projectPathInfo?.path || null
  });
  const candidatePlatforms = listCandidatePlatforms(config, resolved.platform);
  const attempts = [];

  if (candidatePlatforms.length === 0) {
    const error = new Error("No available upstream configured");
    error.statusCode = 500;
    onRequestComplete?.(buildRequestEntry({
      request,
      body,
      routeInfo: createRouteInfo(resolved, attempts),
      statusCode: error.statusCode,
      startedAt,
      projectPathInfo,
      errorMessage: error.message
    }));
    throw error;
  }

  let finalResponse = null;
  let finalRouteInfo = createRouteInfo(resolved, attempts);
  let lastError = null;

  try {
    for (let index = 0; index < candidatePlatforms.length; index += 1) {
      const platform = candidatePlatforms[index];
      const upstream = config?.upstreams?.[platform];

      try {
      const upstreamResponse = await fetchImpl(buildUpstreamUrl(upstream.baseUrl, request.url), {
        method: request.method,
        headers: filterRequestHeaders(request.headers, upstream.apiKey),
        body: request.method === "GET" || request.method === "HEAD" ? undefined : body
      });

        attempts.push({
          platform,
          statusCode: upstreamResponse.status
        });

        if (isRetryableStatus(upstreamResponse.status) && index < candidatePlatforms.length - 1) {
          continue;
        }

        finalResponse = upstreamResponse;
        finalRouteInfo = createRouteInfo(resolved, attempts, platform);
        break;
      } catch (error) {
        lastError = error;
        attempts.push({
          platform,
          statusCode: error.statusCode || 502,
          errorMessage: error.message || "Upstream request failed"
        });

        if (index === candidatePlatforms.length - 1) {
          throw error;
        }
      }
    }

    if (!finalResponse) {
      throw lastError || new Error("No upstream response available");
    }

    response.writeHead(finalResponse.status, filterResponseHeaders(finalResponse.headers, finalRouteInfo));

    if (!finalResponse.body) {
      response.end();
      onRequestComplete?.(buildRequestEntry({
        request,
        body,
        routeInfo: finalRouteInfo,
        statusCode: finalResponse.status,
        startedAt,
        projectPathInfo
      }));
      return finalRouteInfo;
    }

    await pipeUpstreamBody(finalResponse.body, response);
    onRequestComplete?.(buildRequestEntry({
      request,
      body,
      routeInfo: finalRouteInfo,
      statusCode: finalResponse.status,
      startedAt,
      projectPathInfo
    }));
    return finalRouteInfo;
  } catch (error) {
    onRequestComplete?.(buildRequestEntry({
      request,
      body,
      routeInfo: createRouteInfo(resolved, attempts, attempts.at(-1)?.platform || resolved.platform),
      statusCode: error.statusCode || 502,
      startedAt,
      projectPathInfo,
      errorMessage: error.message || "Upstream request failed"
    }));
    throw error;
  }
}
