import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

export const OFFICIAL_OPENAI_BASE_URL = "https://api.openai.com/v1";
export const LOCAL_PROXY_PROVIDER = "codex_local_proxy";

const OPENAI_SECTION_HEADER = "[model_providers.OpenAI]";
const PREVIOUS_PROVIDER_MARKER = "# codex-local-proxy: previous-model-provider = ";

function parseTomlString(value) {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function extractTomlStringAssignment(line, key) {
  const match = line.trim().match(new RegExp(`^${key}\\s*=\\s*("(?:\\\\.|[^"\\\\])*")\\s*$`));
  return match ? parseTomlString(match[1]) : null;
}

function findSectionRange(lines, sectionHeader) {
  const start = lines.findIndex((line) => line.trim() === sectionHeader);

  if (start === -1) {
    return null;
  }

  let end = lines.length;
  for (let index = start + 1; index < lines.length; index += 1) {
    const trimmed = lines[index].trim();
    if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
      end = index;
      break;
    }
  }

  return { start, end };
}

function removeSection(tomlText, sectionHeader) {
  const lines = String(tomlText).split("\n");
  const range = findSectionRange(lines, sectionHeader);

  if (!range) {
    return String(tomlText);
  }

  let start = range.start;
  if (start > 0 && lines[start - 1] === "") {
    start -= 1;
  }
  lines.splice(start, range.end - start);
  return lines.join("\n");
}

function setModelProvider(tomlText, provider) {
  const lines = String(tomlText).split("\n");
  const sectionStart = lines.findIndex((line) => {
    const trimmed = line.trim();
    return trimmed.startsWith("[") && trimmed.endsWith("]");
  });
  const searchEnd = sectionStart === -1 ? lines.length : sectionStart;
  const providerIndex = lines.findIndex((line, index) => (
    index < searchEnd && /^model_provider\s*=/.test(line.trim())
  ));

  if (provider == null) {
    if (providerIndex !== -1) {
      lines.splice(providerIndex, 1);
    }
    return lines.join("\n");
  }

  const assignment = `model_provider = ${JSON.stringify(provider)}`;
  if (providerIndex !== -1) {
    lines[providerIndex] = assignment;
  } else {
    lines.splice(searchEnd, 0, assignment, "");
  }

  return lines.join("\n");
}

function removePreviousProviderMarker(tomlText) {
  return String(tomlText)
    .split("\n")
    .filter((line) => !line.trim().startsWith(PREVIOUS_PROVIDER_MARKER))
    .join("\n");
}

function extractPreviousProvider(tomlText) {
  const markerLine = String(tomlText)
    .split("\n")
    .find((line) => line.trim().startsWith(PREVIOUS_PROVIDER_MARKER));

  if (!markerLine) {
    return null;
  }

  return parseTomlString(markerLine.trim().slice(PREVIOUS_PROVIDER_MARKER.length));
}

export function getCodexHome() {
  return process.env.CODEX_HOME_OVERRIDE || path.join(os.homedir(), ".codex");
}

export function getCodexConfigPath(codexHome = getCodexHome()) {
  return path.join(codexHome, "config.toml");
}

export function getCodexBackupDir(routerHome) {
  return path.join(routerHome, "backups");
}

export function formatBackupTimestamp(date = new Date()) {
  return date.toISOString().replaceAll("-", "").replaceAll(":", "").replace(".", "");
}

async function writeCodexConfigWithBackup({
  transform,
  codexHome = getCodexHome(),
  routerHome
} = {}) {
  const configPath = getCodexConfigPath(codexHome);
  const currentText = await fs.readFile(configPath, "utf8");
  const nextText = transform(currentText);

  if (nextText === currentText) {
    return;
  }

  if (routerHome) {
    const backupDir = getCodexBackupDir(routerHome);
    await fs.mkdir(backupDir, { recursive: true });
    await fs.writeFile(
      path.join(backupDir, `codex-config-${formatBackupTimestamp()}.toml`),
      currentText,
      "utf8"
    );
  }

  const tempPath = `${configPath}.tmp-${process.pid}-${Date.now()}`;
  await fs.writeFile(tempPath, nextText, "utf8");
  await fs.rename(tempPath, configPath);
}

export function getProxyBaseUrl(routerConfig = {}) {
  const host = routerConfig.listenHost || "127.0.0.1";
  const port = Number(routerConfig.listenPort || 3456);
  return `http://${host}:${port}/v1`;
}

export function detectCodexConnectionMode(baseUrl, routerConfig = {}) {
  if (!baseUrl) {
    return "unknown";
  }

  if (baseUrl === getProxyBaseUrl(routerConfig)) {
    return "proxy";
  }

  if (baseUrl === OFFICIAL_OPENAI_BASE_URL) {
    return "official";
  }

  return "custom";
}

export function extractModelProvider(tomlText = "") {
  const lines = String(tomlText).split("\n");

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
      break;
    }

    const provider = extractTomlStringAssignment(trimmed, "model_provider");
    if (provider != null) {
      return provider;
    }
  }

  return null;
}

export function extractProviderBaseUrl(tomlText = "", provider) {
  if (!provider) {
    return null;
  }

  const lines = String(tomlText).split("\n");
  const range = findSectionRange(lines, `[model_providers.${provider}]`);

  if (!range) {
    return null;
  }

  for (let index = range.start + 1; index < range.end; index += 1) {
    const baseUrl = extractTomlStringAssignment(lines[index], "base_url");
    if (baseUrl != null) {
      return baseUrl;
    }
  }

  return null;
}

export function extractOpenAiBaseUrl(tomlText = "") {
  return extractProviderBaseUrl(tomlText, "OpenAI");
}

export function applyProxyTakeover(tomlText = "", baseUrl) {
  const selectedProvider = extractModelProvider(tomlText);
  const previousProvider = extractPreviousProvider(tomlText)
    ?? (selectedProvider === LOCAL_PROXY_PROVIDER ? "" : (selectedProvider || ""));
  let nextText = removeSection(tomlText, `[model_providers.${LOCAL_PROXY_PROVIDER}]`);
  nextText = removePreviousProviderMarker(nextText);
  nextText = setModelProvider(nextText, LOCAL_PROXY_PROVIDER);

  const lines = nextText.split("\n");
  const providerIndex = lines.findIndex((line) => /^model_provider\s*=/.test(line.trim()));
  lines.splice(
    providerIndex === -1 ? 0 : providerIndex,
    0,
    `${PREVIOUS_PROVIDER_MARKER}${JSON.stringify(previousProvider)}`
  );

  while (lines.length > 0 && lines.at(-1) === "") {
    lines.pop();
  }
  lines.push(
    "",
    `[model_providers.${LOCAL_PROXY_PROVIDER}]`,
    'name = "Codex Local Proxy"',
    `base_url = ${JSON.stringify(baseUrl)}`,
    'wire_api = "responses"',
    "requires_openai_auth = true",
    ""
  );
  return lines.join("\n");
}

export function clearProxyTakeover(tomlText = "", proxyBaseUrl) {
  const selectedProvider = extractModelProvider(tomlText);
  const previousProvider = extractPreviousProvider(tomlText);

  if (selectedProvider === LOCAL_PROXY_PROVIDER && previousProvider != null) {
    let nextText = removeSection(tomlText, `[model_providers.${LOCAL_PROXY_PROVIDER}]`);
    nextText = removePreviousProviderMarker(nextText);
    return setModelProvider(nextText, previousProvider || null);
  }

  if (extractProviderBaseUrl(tomlText, selectedProvider) === proxyBaseUrl) {
    if (selectedProvider === "OpenAI") {
      return clearOpenAiBaseUrl(tomlText);
    }
  }

  return String(tomlText);
}

export function applyOpenAiBaseUrl(tomlText = "", baseUrl) {
  const lines = String(tomlText).split("\n");
  const headerIndex = lines.findIndex((line) => line.trim() === OPENAI_SECTION_HEADER);

  if (headerIndex === -1) {
    const nextLines = [...lines];

    if (nextLines.length > 0 && nextLines.at(-1) !== "") {
      nextLines.push("");
    }

    nextLines.push(OPENAI_SECTION_HEADER);
    nextLines.push(`base_url = "${baseUrl}"`);
    return nextLines.join("\n");
  }

  let sectionEndIndex = lines.length;

  for (let index = headerIndex + 1; index < lines.length; index += 1) {
    const trimmed = lines[index].trim();

    if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
      sectionEndIndex = index;
      break;
    }
  }

  for (let index = headerIndex + 1; index < sectionEndIndex; index += 1) {
    if (lines[index].trim().startsWith("base_url")) {
      lines[index] = `base_url = "${baseUrl}"`;
      return lines.join("\n");
    }
  }

  lines.splice(headerIndex + 1, 0, `base_url = "${baseUrl}"`);
  return lines.join("\n");
}

export function clearOpenAiBaseUrl(tomlText = "") {
  const lines = String(tomlText).split("\n");
  const headerIndex = lines.findIndex((line) => line.trim() === OPENAI_SECTION_HEADER);

  if (headerIndex === -1) {
    return String(tomlText);
  }

  let sectionEndIndex = lines.length;

  for (let index = headerIndex + 1; index < lines.length; index += 1) {
    const trimmed = lines[index].trim();

    if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
      sectionEndIndex = index;
      break;
    }
  }

  return lines
    .filter((line, index) => {
      if (index <= headerIndex || index >= sectionEndIndex) {
        return true;
      }

      return !line.trim().startsWith("base_url");
    })
    .join("\n");
}

export async function readCodexConnectionState({ codexHome = getCodexHome(), routerConfig = {} } = {}) {
  try {
    const configText = await fs.readFile(getCodexConfigPath(codexHome), "utf8");
    const provider = extractModelProvider(configText);
    const baseUrl = extractProviderBaseUrl(configText, provider);

    return {
      baseUrl,
      mode: detectCodexConnectionMode(baseUrl, routerConfig),
      provider
    };
  } catch {
    return {
      baseUrl: null,
      mode: "unknown"
    };
  }
}

export async function syncCodexConnectionMode({
  mode,
  codexHome = getCodexHome(),
  routerHome,
  routerConfig = {}
} = {}) {
  const targetBaseUrl = mode === "official"
    ? OFFICIAL_OPENAI_BASE_URL
    : getProxyBaseUrl(routerConfig);
  await writeCodexConfigWithBackup({
    codexHome,
    routerHome,
    transform(currentText) {
      return mode === "official"
        ? applyOpenAiBaseUrl(currentText, targetBaseUrl)
        : applyProxyTakeover(currentText, targetBaseUrl);
    }
  });

  return readCodexConnectionState({
    codexHome,
    routerConfig
  });
}

export async function clearCodexProxyBaseUrl({
  codexHome = getCodexHome(),
  routerHome,
  routerConfig = {}
} = {}) {
  await writeCodexConfigWithBackup({
    codexHome,
    routerHome,
    transform(currentText) {
      return clearProxyTakeover(currentText, getProxyBaseUrl(routerConfig));
    }
  });

  return readCodexConnectionState({
    codexHome,
    routerConfig
  });
}
