# System Proxy Launcher Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Start the packaged local proxy with Node.js environment-proxy support so its upstream requests use `127.0.0.1:7897`.

**Architecture:** Keep proxy selection in the macOS launcher rather than application routing code. Use Node 24's native `--use-env-proxy`, with environment variables that remain overridable by the caller.

**Tech Stack:** Node.js 24, shell launchers, `node:test`.

---

### Task 1: Lock launcher behavior with a test

**Files:**
- Modify: `test/package-macos.test.js`

1. Assert that generated launchers contain `HTTP_PROXY`, `HTTPS_PROXY`, `NO_PROXY`, and `--use-env-proxy`.
2. Run `node --test test/package-macos.test.js` and confirm it fails because the launcher lacks them.

### Task 2: Update launcher generation

**Files:**
- Modify: `scripts/package-macos.js`

1. Add overridable proxy defaults and localhost exclusions.
2. Pass `--use-env-proxy` to the bundled Node runtime.
3. Run the targeted test and confirm it passes.

### Task 3: Synchronize the installed launchers

**Files:**
- Modify: `dist/codex-local-proxy-macos-v0.1.0/bin/start.command`
- Modify: `dist/codex-local-proxy-macos-v0.1.0/bin/start-preview.command`

1. Apply the same launcher changes directly.
2. Do not rebuild the bundle, preserving installed local source differences.

### Task 4: Restart and verify

1. Run the full `npm test` suite.
2. Stop and start the packaged proxy.
3. Verify the PID and `/_router/status` endpoint.
4. Verify the `lx` upstream through the local proxy with a non-billable models request.
5. Check that no new unhandled transport error is written to the log.
