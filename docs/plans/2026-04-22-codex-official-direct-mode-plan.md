# Codex 官方直连模式 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a dual-mode flow so Codex can switch between local-proxy routing and direct official OpenAI access without treating `openapi` as a normal proxy upstream.

**Architecture:** Keep the local proxy running as the control plane, but add a separate connection-mode state that synchronizes Codex's local `config.toml` `base_url`. Proxy mode continues to use `cdapi / ttapi`; official mode bypasses the proxy and points Codex back to the OpenAI endpoint.

**Tech Stack:** Node.js, built-in `http`, filesystem access, minimal TOML text patching, node:test

---

### Task 1: Add design-time docs and config model

**Files:**
- Modify: `tools/codex-local-proxy/src/config.js`
- Modify: `tools/codex-local-proxy/README.md`
- Create: `docs/plans/2026-04-22-codex-official-direct-mode-design.md`
- Create: `docs/plans/2026-04-22-codex-official-direct-mode-plan.md`

**Step 1: Write the failing test**

Add a test that normalizing router config without `connectionMode` defaults to `proxy`.

**Step 2: Run test to verify it fails**

Run: `npm test -- test/config-mode.test.js`
Expected: fail because `connectionMode` is missing from normalized config.

**Step 3: Write minimal implementation**

Add `connectionMode: "proxy"` to default config and normalize persisted values.

**Step 4: Run test to verify it passes**

Run: `npm test -- test/config-mode.test.js`
Expected: pass.

### Task 2: Add Codex config synchronization helpers

**Files:**
- Create: `tools/codex-local-proxy/src/codex-config.js`
- Create: `tools/codex-local-proxy/test/codex-config.test.js`

**Step 1: Write the failing test**

Cover:

- detect `proxy` mode from `base_url = "http://127.0.0.1:3456/v1"`
- detect `official` mode from `base_url = "https://api.openai.com/v1"`
- patch an existing `base_url` line inside `[model_providers.OpenAI]`

**Step 2: Run test to verify it fails**

Run: `npm test -- test/codex-config.test.js`
Expected: fail because helper module does not exist.

**Step 3: Write minimal implementation**

Implement a focused text-based updater for the `model_providers.OpenAI` section and helpers to:

- resolve Codex home/config path
- read current base URL
- infer current mode: `proxy | official | custom`
- write target base URL for proxy or official mode

**Step 4: Run test to verify it passes**

Run: `npm test -- test/codex-config.test.js`
Expected: pass.

### Task 3: Add mode switch API and status fields

**Files:**
- Modify: `tools/codex-local-proxy/src/server.js`
- Create: `tools/codex-local-proxy/test/connection-mode.test.js`

**Step 1: Write the failing test**

Cover:

- `GET /_router/status` returns `connectionMode` and parsed Codex connection info
- `POST /_router/connection-mode` switches to `official`
- `POST /_router/connection-mode` switches back to `proxy`

**Step 2: Run test to verify it fails**

Run: `npm test -- test/connection-mode.test.js`
Expected: fail because endpoint and payload fields do not exist.

**Step 3: Write minimal implementation**

Integrate Codex config helper into status builder and mode-switch endpoint, and persist `connectionMode` to router config.

**Step 4: Run test to verify it passes**

Run: `npm test -- test/connection-mode.test.js`
Expected: pass.

### Task 4: Update dashboard to show runtime mode

**Files:**
- Modify: `tools/codex-local-proxy/src/dashboard.js`
- Modify: `tools/codex-local-proxy/test/dashboard.test.js`

**Step 1: Write the failing test**

Assert dashboard script/html contains:

- connection mode action
- official-mode copy
- proxy-only route switching behavior

**Step 2: Run test to verify it fails**

Run: `npm test -- test/dashboard.test.js`
Expected: fail because UI does not expose runtime mode.

**Step 3: Write minimal implementation**

Add:

- mode buttons
- official-mode notice
- disable/hide proxy platform switching while in official mode

**Step 4: Run test to verify it passes**

Run: `npm test -- test/dashboard.test.js`
Expected: pass.

### Task 5: Extend CLI and docs

**Files:**
- Modify: `tools/codex-local-proxy/src/cli.js`
- Modify: `tools/codex-local-proxy/test/cli.test.js`
- Modify: `tools/codex-local-proxy/README.md`

**Step 1: Write the failing test**

Add a CLI case for `mode official` and `mode proxy`.

**Step 2: Run test to verify it fails**

Run: `npm test -- test/cli.test.js`
Expected: fail because CLI command does not exist.

**Step 3: Write minimal implementation**

Add CLI subcommand:

- `mode <proxy|official>`

Refresh README wording so it no longer claims “never modifies config.toml”.

**Step 4: Run test to verify it passes**

Run: `npm test -- test/cli.test.js`
Expected: pass.

### Task 6: Full verification and preview rollout

**Files:**
- Verify only

**Step 1: Run full test suite**

Run: `npm test`
Expected: all tests pass.

**Step 2: Restart preview instance only**

Run: `npm run start:preview`
Expected: preview continues on `http://127.0.0.1:3457`.

**Step 3: Verify preview status**

Run: `curl -sS http://127.0.0.1:3457/_router/status`
Expected: payload contains correct `listenPort`, `connectionMode`, and `codexConnection`.
