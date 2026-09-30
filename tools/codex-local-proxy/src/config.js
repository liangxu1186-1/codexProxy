import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

export const DEFAULT_ROUTER_HOME = path.join(os.homedir(), ".codex-router");

export function getRouterHome() {
  return process.env.CODEX_ROUTER_HOME || DEFAULT_ROUTER_HOME;
}

export function getDefaultConfig() {
  return {
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
        apiKey: ""
      },
      ttapi: {
        baseUrl: "https://w.ciykj.cn",
        apiKey: ""
      }
    },
    projectRoutes: []
  };
}

export function getConfigPath(routerHome = getRouterHome()) {
  return path.join(routerHome, "config.json");
}

export function normalizeConfig(rawConfig = {}) {
  const defaults = getDefaultConfig();
  const sourceUpstreams = rawConfig.upstreams && typeof rawConfig.upstreams === "object"
    ? rawConfig.upstreams
    : defaults.upstreams;
  const normalizedUpstreams = {};

  for (const [platform, upstream] of Object.entries(sourceUpstreams)) {
    normalizedUpstreams[platform] = {
      baseUrl: typeof upstream?.baseUrl === "string" ? upstream.baseUrl : "",
      apiKey: typeof upstream?.apiKey === "string" ? upstream.apiKey : ""
    };
  }

  return {
    ...defaults,
    ...rawConfig,
    listenPort: Number(rawConfig.listenPort || defaults.listenPort),
    connectionMode: rawConfig.connectionMode === "official" ? "official" : "proxy",
    defaultPlatform: rawConfig.defaultPlatform === null
      ? null
      : (typeof rawConfig.defaultPlatform === "string" ? rawConfig.defaultPlatform : defaults.defaultPlatform),
    upstreams: normalizedUpstreams,
    projectRoutes: Array.isArray(rawConfig.projectRoutes) ? rawConfig.projectRoutes : []
  };
}

export async function ensureRouterHome(routerHome = getRouterHome()) {
  await fs.mkdir(routerHome, { recursive: true });
}

export async function loadConfig(routerHome = getRouterHome()) {
  try {
    const raw = await fs.readFile(getConfigPath(routerHome), "utf8");
    return normalizeConfig(JSON.parse(raw));
  } catch (error) {
    if (error?.code !== "ENOENT") {
      throw error;
    }

    const nextConfig = getDefaultConfig();
    await saveConfig(nextConfig, routerHome);
    return normalizeConfig(nextConfig);
  }
}

export async function saveConfig(config, routerHome = getRouterHome()) {
  await ensureRouterHome(routerHome);
  await fs.writeFile(
    getConfigPath(routerHome),
    JSON.stringify(normalizeConfig(config), null, 2) + "\n",
    "utf8"
  );
}

export function sanitizeConfig(config) {
  const normalized = normalizeConfig(config);
  const upstreams = {};

  for (const [platform, upstream] of Object.entries(normalized.upstreams)) {
    upstreams[platform] = {
      baseUrl: upstream.baseUrl,
      hasApiKey: Boolean(upstream.apiKey)
    };
  }

  return {
    listenHost: normalized.listenHost,
    listenPort: normalized.listenPort,
    connectionMode: normalized.connectionMode,
    defaultPlatform: normalized.defaultPlatform,
    upstreams,
    projectRoutes: normalized.projectRoutes
  };
}
