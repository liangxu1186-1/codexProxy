import test from "node:test";
import assert from "node:assert/strict";

import {
  OFFICIAL_OPENAI_BASE_URL,
  applyProxyTakeover,
  applyOpenAiBaseUrl,
  clearProxyTakeover,
  clearOpenAiBaseUrl,
  detectCodexConnectionMode,
  extractModelProvider,
  extractProviderBaseUrl
} from "../src/codex-config.js";

const SAMPLE_CONFIG = `model_provider = "OpenAI"

[model_providers.OpenAI]
base_url = "http://127.0.0.1:3456/v1"
name = "OpenAI"
requires_openai_auth = true
wire_api = "responses"
`;

const CUSTOM_PROVIDER_CONFIG = `model = "gpt-5.6-sol"
model_provider = "freehyy"

[model_providers.freehyy]
name = "OpenAI"
base_url = "https://intl.freehyy.com/v1"
wire_api = "responses"
requires_openai_auth = true

[features]
multi_agent = true
`;

test("detectCodexConnectionMode returns proxy for local proxy base url", () => {
  const result = detectCodexConnectionMode("http://127.0.0.1:3456/v1", {
    listenHost: "127.0.0.1",
    listenPort: 3456
  });

  assert.equal(result, "proxy");
});

test("detectCodexConnectionMode returns official for official base url", () => {
  const result = detectCodexConnectionMode(OFFICIAL_OPENAI_BASE_URL, {
    listenHost: "127.0.0.1",
    listenPort: 3456
  });

  assert.equal(result, "official");
});

test("applyOpenAiBaseUrl patches base_url inside OpenAI provider section", () => {
  const result = applyOpenAiBaseUrl(SAMPLE_CONFIG, OFFICIAL_OPENAI_BASE_URL);

  assert.match(result, /base_url = "https:\/\/api\.openai\.com\/v1"/);
  assert.doesNotMatch(result, /base_url = "http:\/\/127\.0\.0\.1:3456\/v1"/);
});

test("clearOpenAiBaseUrl removes base_url inside OpenAI provider section", () => {
  const result = clearOpenAiBaseUrl(SAMPLE_CONFIG);

  assert.doesNotMatch(result, /base_url = /);
  assert.match(result, /name = "OpenAI"/);
});

test("extracts the selected provider and its base URL", () => {
  assert.equal(extractModelProvider(CUSTOM_PROVIDER_CONFIG), "freehyy");
  assert.equal(
    extractProviderBaseUrl(CUSTOM_PROVIDER_CONFIG, "freehyy"),
    "https://intl.freehyy.com/v1"
  );
});

test("proxy takeover installs a complete dedicated provider", () => {
  const result = applyProxyTakeover(CUSTOM_PROVIDER_CONFIG, "http://127.0.0.1:3456/v1");

  assert.match(result, /^model_provider = "codex_local_proxy"$/m);
  assert.match(result, /^# codex-local-proxy: previous-model-provider = "freehyy"$/m);
  assert.match(result, /^\[model_providers\.codex_local_proxy\]$/m);
  assert.match(result, /^name = "Codex Local Proxy"$/m);
  assert.match(result, /^base_url = "http:\/\/127\.0\.0\.1:3456\/v1"$/m);
  assert.match(result, /^wire_api = "responses"$/m);
  assert.match(result, /^requires_openai_auth = true$/m);
  assert.match(result, /^\[model_providers\.freehyy\]$/m);
  assert.match(result, /^base_url = "https:\/\/intl\.freehyy\.com\/v1"$/m);
});

test("clearing takeover restores the previous provider and removes the dedicated section", () => {
  const attached = applyProxyTakeover(CUSTOM_PROVIDER_CONFIG, "http://127.0.0.1:3456/v1");
  const result = clearProxyTakeover(attached, "http://127.0.0.1:3456/v1");

  assert.match(result, /^model_provider = "freehyy"$/m);
  assert.doesNotMatch(result, /codex-local-proxy: previous-model-provider/);
  assert.doesNotMatch(result, /\[model_providers\.codex_local_proxy\]/);
  assert.match(result, /^\[model_providers\.freehyy\]$/m);
  assert.match(result, /^base_url = "https:\/\/intl\.freehyy\.com\/v1"$/m);
});
