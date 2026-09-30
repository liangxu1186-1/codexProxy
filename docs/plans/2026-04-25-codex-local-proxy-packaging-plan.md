# Codex Local Proxy Packaging Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 把当前本地代理从“工程师手动运行工具”收口到“可继续产品化打包”的稳定基础版本。

**Architecture:** 本轮不直接做安装器或 `.app`，先补运行时基础设施：首次启动自动初始化、Codex 配置改写备份、启动冲突提示、文档与 CLI/UI 语义收口。这样可以在不改核心代理链路的前提下，把后续单可执行和 LaunchAgent 接入点准备好。

**Tech Stack:** Node.js ESM、内置 `node:test`、本地文件系统、HTTP 管理页

---

### Task 1: 写产品化边界文档

**Files:**
- Create: `docs/plans/2026-04-25-codex-local-proxy-packaging-plan.md`
- Modify: `tools/codex-local-proxy/README.md`

**Step 1: 写出本轮范围**

- 明确 `Phase 1` 只做：
- 自动初始化配置
- 改写 `~/.codex/config.toml` 前备份
- 启动冲突时给出更明确提示
- README 与当前实现一致

**Step 2: 更新 README 的旧语义**

- 删除“官方直连模式 / mode official / connection-mode 接口”等旧描述
- 改成“清除本地代理”“全局平台切换”“后续打包方向”

**Step 3: 验证文档无旧残留**

Run: `rg -n "官方直连|connection-mode|mode official|mode <proxy\\|official>" tools/codex-local-proxy/README.md`

Expected: 无输出

### Task 2: 补首次启动自动初始化

**Files:**
- Modify: `tools/codex-local-proxy/src/config.js`
- Modify: `tools/codex-local-proxy/test/config-mode.test.js`

**Step 1: 写失败测试**

- 覆盖 `loadConfig()` 在配置文件不存在时自动创建默认配置

**Step 2: 跑测试确认失败**

Run: `npm test -- test/config-mode.test.js`

Expected: FAIL，提示缺少配置文件或未创建默认配置

**Step 3: 实现最小代码**

- 在 `loadConfig()` 捕获 `ENOENT`
- 自动 `saveConfig(getDefaultConfig())`
- 再返回默认配置

**Step 4: 跑测试确认通过**

Run: `npm test -- test/config-mode.test.js`

Expected: PASS

### Task 3: 为 Codex 配置改写增加备份和原子写入

**Files:**
- Modify: `tools/codex-local-proxy/src/codex-config.js`
- Modify: `tools/codex-local-proxy/test/codex-config.test.js`
- Modify: `tools/codex-local-proxy/test/connection-mode.test.js`

**Step 1: 写失败测试**

- 覆盖清除本地代理前会生成备份文件
- 覆盖写入后 `config.toml` 仍可被重新读取

**Step 2: 跑测试确认失败**

Run: `npm test -- test/codex-config.test.js test/connection-mode.test.js`

Expected: FAIL，当前没有备份文件

**Step 3: 写最小实现**

- 增加 `getCodexConfigBackupPath()`
- 统一通过 `updateCodexConfig()` 做：
- 读当前文件
- 写备份
- 写临时文件
- 原子 `rename`

**Step 4: 跑测试确认通过**

Run: `npm test -- test/codex-config.test.js test/connection-mode.test.js`

Expected: PASS

### Task 4: 提升正式启动冲突提示

**Files:**
- Modify: `tools/codex-local-proxy/src/server.js`
- Modify: `tools/codex-local-proxy/test/server-start.test.js`

**Step 1: 写失败测试**

- 覆盖 `EADDRINUSE` 时返回更可读的错误信息

**Step 2: 跑测试确认失败**

Run: `npm test -- test/server-start.test.js`

Expected: FAIL，当前只有原始系统错误

**Step 3: 写最小实现**

- 在 `startRouterServer()` 启动失败时包装错误
- 明确提示端口、可能原因、建议先停旧进程

**Step 4: 跑测试确认通过**

Run: `npm test -- test/server-start.test.js`

Expected: PASS

### Task 5: 收口 CLI 和 README 到当前产品语义

**Files:**
- Modify: `tools/codex-local-proxy/src/cli.js`
- Modify: `tools/codex-local-proxy/README.md`
- Modify: `tools/codex-local-proxy/test/cli.test.js`

**Step 1: 检查是否还有旧命令文案**

Run: `rg -n "mode <proxy\\|official>|official|connection-mode" tools/codex-local-proxy/src/cli.js tools/codex-local-proxy/README.md`

Expected: 若仍存在则继续清理

**Step 2: 补当前命令说明**

- `status`
- `use/switch`
- `clear-proxy`

**Step 3: 验证无旧残留**

Run: `rg -n "mode <proxy\\|official>|官方直连模式|connection-mode" tools/codex-local-proxy`

Expected: 只有测试中允许的兼容残留，README 和 CLI 说明中不再出现

### Task 6: 跑全量验证

**Files:**
- Modify: `tools/codex-local-proxy/README.md`
- Verify: `tools/codex-local-proxy/test/*.js`

**Step 1: 跑全量测试**

Run: `cd tools/codex-local-proxy && npm test`

Expected: 全绿

**Step 2: 做一次人工核查**

- 首页文案是否已是当前产品语义
- `/_router/status` 是否仍可返回状态
- 清除本地代理后是否仍能正常返回 `codexConnection.mode`

**Step 3: 记录下一阶段入口**

- `Phase 2`: 单可执行分发
- `Phase 3`: macOS LaunchAgent + 开机自启 + 安装脚本
