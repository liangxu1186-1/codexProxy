import fs from "node:fs/promises";

import { ensureRouterHome, getConfigPath, getRouterHome, saveConfig, getDefaultConfig } from "../src/config.js";

async function main() {
  const routerHome = getRouterHome();
  const configPath = getConfigPath(routerHome);

  await ensureRouterHome(routerHome);

  try {
    await fs.access(configPath);
    process.stdout.write(`Config already exists: ${configPath}\n`);
    return;
  } catch (error) {
    if (error.code !== "ENOENT") {
      throw error;
    }
  }

  await saveConfig(getDefaultConfig(), routerHome);
  process.stdout.write(`Created starter config: ${configPath}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error.stack || error.message}\n`);
  process.exitCode = 1;
});
