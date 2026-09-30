# Provider-Safe Codex Takeover Design

## Goal

Make the dashboard's Codex takeover work with any currently selected model provider without creating an invalid provider section, and restore the original provider when takeover is cleared.

## Evidence

- The current Codex configuration selects `model_provider = "freehyy"`.
- The existing takeover implementation always edits `[model_providers.OpenAI]`.
- When that section is absent, the implementation creates only `base_url`, while Codex requires a non-empty provider `name`.
- Codex Desktop logged `invalid configuration: model_providers.OpenAI: provider name must not be empty` immediately after takeover.

## Options Considered

1. Patch the active provider's `base_url` in place. This is small, but clearing takeover cannot reliably restore the previous URL without maintaining additional state.
2. Create a complete dedicated local-proxy provider and temporarily select it. This keeps the user's provider intact and makes rollback deterministic. This is the selected approach.
3. Complete the hard-coded OpenAI section and select it. This avoids the validation error but still overwrites the user's provider choice and couples the feature to one provider name.

## Design

Takeover writes a complete `[model_providers.codex_local_proxy]` section containing `name`, `base_url`, `wire_api`, and `requires_openai_auth`. It records the previously selected provider in a tool-owned TOML comment and changes the top-level `model_provider` to `codex_local_proxy`.

Clearing takeover reads the marker, restores the previous top-level provider, removes the marker, and removes the dedicated provider section. Existing legacy configurations whose active provider already points at the proxy remain supported by clearing that provider's `base_url`.

Connection status is derived from the selected provider and that provider's `base_url`, rather than from a hard-coded OpenAI section. The implementation remains dependency-free and uses the project's existing line-oriented configuration transformations.

## Error Handling

- File writes retain the existing backup-before-atomic-rename behavior.
- A configuration with no explicit previous provider restores by removing the injected top-level `model_provider` entry.
- Repeated clear operations remain idempotent.

## Verification

- Unit tests cover provider extraction, complete takeover configuration, and restoration.
- Endpoint tests reproduce the `freehyy` configuration that caused the failure.
- Existing OpenAI-based compatibility tests continue to pass.
- The complete Node test suite must pass before delivery.
