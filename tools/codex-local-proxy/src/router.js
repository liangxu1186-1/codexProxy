import path from "node:path";

const PROJECT_PATH_HEADERS = [
  "x-codex-project-path",
  "x-project-path",
  "x-workspace-root",
  "x-workspace-path",
  "x-working-directory",
  "x-current-working-directory",
  "x-cwd"
];

const BODY_PATH_KEYS = new Set([
  "projectPath",
  "project_path",
  "workspaceRoot",
  "workspace_root",
  "workspacePath",
  "workspace_path",
  "workingDirectory",
  "working_directory",
  "currentWorkingDirectory",
  "current_working_directory",
  "cwd"
]);

function normalizePath(inputPath) {
  if (!inputPath || typeof inputPath !== "string") {
    return null;
  }

  const normalized = path.resolve(inputPath.trim());
  return normalized === path.sep ? normalized : normalized.replace(/[\\/]+$/, "");
}

function getConfiguredPlatforms(config) {
  const configured = Object.keys(config?.upstreams || {});
  return new Set(configured);
}

function getKnownPlatform(platform, config) {
  if (!platform || typeof platform !== "string") {
    return null;
  }

  const normalized = platform.trim();
  return getConfiguredPlatforms(config).has(normalized) ? normalized : null;
}

function getUpstream(platform, config) {
  const knownPlatform = getKnownPlatform(platform, config);

  if (!knownPlatform) {
    return null;
  }

  return config?.upstreams?.[knownPlatform] || null;
}

export function isRoutablePlatform(platform, config) {
  const upstream = getUpstream(platform, config);
  return Boolean(upstream?.baseUrl && upstream?.apiKey);
}

export function listRoutablePlatforms(config) {
  return [...getConfiguredPlatforms(config)].filter((platform) => isRoutablePlatform(platform, config));
}

export function pickDefaultPlatform(config) {
  return (
    (isRoutablePlatform(config?.defaultPlatform, config) ? getKnownPlatform(config?.defaultPlatform, config) : null)
    || listRoutablePlatforms(config)[0]
    || getKnownPlatform(config?.defaultPlatform, config)
    || [...getConfiguredPlatforms(config)][0]
    || null
  );
}

function isPathPrefix(routePath, projectPath) {
  return projectPath === routePath || projectPath.startsWith(`${routePath}${path.sep}`);
}

function findBestProjectRoute(projectPath, projectRoutes = []) {
  if (!projectPath) {
    return null;
  }

  const normalizedProjectPath = normalizePath(projectPath);
  const candidates = projectRoutes
    .map((route) => ({
      ...route,
      path: normalizePath(route.path)
    }))
    .filter((route) => route.path && route.platform && isPathPrefix(route.path, normalizedProjectPath))
    .sort((left, right) => right.path.length - left.path.length);

  return candidates[0] || null;
}

function findPathInObject(value, segments = []) {
  if (!value || typeof value !== "object") {
    return null;
  }

  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      const found = findPathInObject(value[index], [...segments, String(index)]);

      if (found) {
        return found;
      }
    }

    return null;
  }

  for (const [key, nestedValue] of Object.entries(value)) {
    const nextSegments = [...segments, key];

    if (BODY_PATH_KEYS.has(key) && typeof nestedValue === "string") {
      const normalized = normalizePath(nestedValue);

      if (normalized) {
        return {
          path: normalized,
          source: `body:${nextSegments.join(".")}`
        };
      }
    }

    const found = findPathInObject(nestedValue, nextSegments);

    if (found) {
      return found;
    }
  }

  return null;
}

export function resolveRoute({ config, projectPath }) {
  const defaultPlatform = pickDefaultPlatform(config);
  const normalizedProjectPath = normalizePath(projectPath);

  const projectRoute = findBestProjectRoute(normalizedProjectPath, config?.projectRoutes);

  if (projectRoute && isRoutablePlatform(projectRoute.platform, config)) {
    return {
      platform: projectRoute.platform,
      reason: "projectRoute",
      projectPath: normalizedProjectPath,
      matchedRoute: {
        path: projectRoute.path,
        platform: projectRoute.platform
      }
    };
  }

  return {
    platform: defaultPlatform,
    reason: "default",
    projectPath: normalizedProjectPath
  };
}

export function extractProjectPath(request, bodyText = "") {
  const headers = request?.headers || {};

  for (const headerName of PROJECT_PATH_HEADERS) {
    const headerValue = headers[headerName] || headers[headerName.toLowerCase()] || headers[headerName.toUpperCase()];
    const normalized = normalizePath(Array.isArray(headerValue) ? headerValue[0] : headerValue);

    if (normalized) {
      return {
        path: normalized,
        source: `header:${headerName}`
      };
    }
  }

  if (!bodyText) {
    return null;
  }

  try {
    const parsed = JSON.parse(Buffer.isBuffer(bodyText) ? bodyText.toString("utf8") : String(bodyText));
    return findPathInObject(parsed);
  } catch {
    return null;
  }
}

export function isSupportedPlatform(platform, config) {
  return Boolean(getKnownPlatform(platform, config));
}

export function normalizeProjectRoutePath(inputPath) {
  return normalizePath(inputPath);
}

export function listSupportedPlatforms(config) {
  return [...getConfiguredPlatforms(config)];
}
