import { getRouterHome, loadConfig, saveConfig } from "./config.js";
import { isSupportedPlatform, normalizeProjectRoutePath } from "./router.js";

const DEFAULT_PROXY_BASE_URL = process.env.CODEX_ROUTER_BASE_URL || "http://127.0.0.1:3456";

function writeLine(stream, value) {
  const text = typeof value === "string" ? value : JSON.stringify(value, null, 2);
  stream.write(`${text}\n`);
}

async function requestJson(baseUrl, requestPath, init = {}, fetchImpl = fetch) {
  const response = await fetchImpl(`${baseUrl}${requestPath}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(init.headers || {})
    }
  });
  const payload = await response.json();

  if (!response.ok) {
    const error = new Error(payload.error || `Request failed: ${response.status}`);
    error.statusCode = response.status;
    error.payload = payload;
    throw error;
  }

  return payload;
}

function upsertProjectRoute(projectRoutes, nextRoute) {
  const nextRoutes = projectRoutes.filter((route) => route.path !== nextRoute.path);
  nextRoutes.push(nextRoute);
  return nextRoutes;
}

export async function runCli(args = [], options = {}) {
  const [command, ...rest] = args;
  const stdout = options.stdout || process.stdout;
  const baseUrl = options.baseUrl || DEFAULT_PROXY_BASE_URL;
  const routerHome = options.routerHome || getRouterHome();
  const fetchImpl = options.fetchImpl || fetch;

  switch (command) {
    case "status": {
      const targetPath = rest[0] || process.cwd();
      const payload = await requestJson(
        baseUrl,
        `/_router/status?path=${encodeURIComponent(targetPath)}`,
        {},
        fetchImpl
      );
      writeLine(stdout, payload);
      return payload;
    }

    case "use":
    case "switch": {
      const platform = rest[0];

      if (!platform) {
        throw new Error("Usage: codex-route switch <platform>");
      }

      const payload = await requestJson(
        baseUrl,
        "/_router/default-platform",
        {
          method: "POST",
          body: JSON.stringify({ platform })
        },
        fetchImpl
      );
      writeLine(stdout, payload);
      return payload;
    }

    case "resolve": {
      const targetPath = rest[0] || process.cwd();
      const payload = await requestJson(
        baseUrl,
        "/_router/routes/resolve",
        {
          method: "POST",
          body: JSON.stringify({ path: targetPath })
        },
        fetchImpl
      );
      writeLine(stdout, payload);
      return payload;
    }

    case "clear-proxy": {
      const payload = await requestJson(
        baseUrl,
        "/_router/clear-proxy",
        {
          method: "POST",
          body: JSON.stringify({})
        },
        fetchImpl
      );
      writeLine(stdout, payload);
      return payload;
    }

    case "map": {
      const [rawPath, platform] = rest;

      if (!rawPath || !platform) {
        throw new Error("Usage: codex-route map <path> <platform>");
      }

      const config = await loadConfig(routerHome);

      if (!isSupportedPlatform(platform, config)) {
        throw new Error(`Unsupported platform: ${platform}`);
      }

      const projectPath = normalizeProjectRoutePath(rawPath);
      const nextConfig = {
        ...config,
        projectRoutes: upsertProjectRoute(config.projectRoutes, {
          path: projectPath,
          platform
        })
      };

      await saveConfig(nextConfig, routerHome);

      const payload = {
        action: "map",
        route: {
          path: projectPath,
          platform
        },
        projectRouteCount: nextConfig.projectRoutes.length
      };
      writeLine(stdout, payload);
      return payload;
    }

    case "unmap": {
      const [rawPath] = rest;

      if (!rawPath) {
        throw new Error("Usage: codex-route unmap <path>");
      }

      const config = await loadConfig(routerHome);
      const projectPath = normalizeProjectRoutePath(rawPath);
      const nextRoutes = config.projectRoutes.filter((route) => route.path !== projectPath);
      const nextConfig = {
        ...config,
        projectRoutes: nextRoutes
      };

      await saveConfig(nextConfig, routerHome);

      const payload = {
        action: "unmap",
        path: projectPath,
        removed: nextRoutes.length !== config.projectRoutes.length,
        projectRouteCount: nextRoutes.length
      };
      writeLine(stdout, payload);
      return payload;
    }

    default:
      throw new Error(
        "Usage: codex-route <status [path]|switch <platform>|use <platform>|clear-proxy|resolve [path]|map <path> <platform>|unmap <path>>"
      );
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runCli(process.argv.slice(2)).catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}
