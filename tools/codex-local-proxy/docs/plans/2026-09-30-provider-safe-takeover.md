# Provider-Safe Codex Takeover Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Route Codex through a complete dedicated local-proxy provider and restore the user's previous provider when takeover is cleared.

**Architecture:** Generalize Codex config inspection to follow the selected provider. Add reversible transformations that install/remove a dedicated `codex_local_proxy` section while preserving the prior provider in a tool-owned comment.

**Tech Stack:** Node.js, ECMAScript modules, `node:test`, TOML-compatible line transformations.

---

### Task 1: Lock the regression with failing unit tests

**Files:**
- Modify: `test/codex-config.test.js`

1. Add a `freehyy` fixture with no OpenAI section.
2. Assert takeover selects `codex_local_proxy` and writes every required field.
3. Assert clearing restores `freehyy` and removes the dedicated section.
4. Run `node --test test/codex-config.test.js` and confirm the new tests fail for the missing behavior.

### Task 2: Implement reversible provider transformations

**Files:**
- Modify: `src/codex-config.js`

1. Add selected-provider and provider-base-URL extraction.
2. Add the dedicated provider takeover transformation.
3. Add restoration and dedicated-section removal.
4. Update connection-state detection to inspect the selected provider.
5. Run `node --test test/codex-config.test.js` and confirm it passes.

### Task 3: Verify endpoint behavior for a custom provider

**Files:**
- Modify: `test/connection-mode.test.js`

1. Change the endpoint fixture to use `freehyy` as the original provider.
2. Assert takeover writes a complete dedicated provider and status reports proxy mode.
3. Assert clear restores `freehyy` without altering its configuration.
4. Run `node --test test/connection-mode.test.js` and confirm it passes.

### Task 4: Verify the complete project

1. Run `npm test`.
2. Confirm zero failing tests and no unexpected warnings.
3. Inspect the changed files to ensure no runtime configuration or secrets were modified.
