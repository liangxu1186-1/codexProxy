# System Proxy Launcher Design

## Goal

Make the packaged macOS launcher route Node.js upstream `fetch` calls through the user's active local proxy instead of the failing `utun4` path.

## Evidence

- Direct requests to `43.156.164.115:8080` connect at TCP level but receive no HTTP response.
- Requests through `127.0.0.1:7897` return HTTP 200.
- The bundled Node.js 24.15.0 runtime returns HTTP 200 when started with `--use-env-proxy` and `HTTP_PROXY`/`HTTPS_PROXY`.
- The running proxy logs `UND_ERR_BODY_TIMEOUT` and `UND_ERR_SOCKET`, not `INSUFFICIENT_BALANCE`.

## Design

The generated macOS launchers will provide overridable defaults for `HTTP_PROXY` and `HTTPS_PROXY`, exclude localhost through `NO_PROXY`, and start Node with `--use-env-proxy`. The currently installed launchers will be synchronized with the generator without rebuilding the whole bundle, because the installed bundle contains local source changes that are not present in the source directory.

No Sub2API server, balance, database, authentication, or routing configuration will be changed.

## Verification

- Launcher generation test proves the flags and environment variables are present.
- Full Node test suite passes.
- Restarted proxy reports healthy on `127.0.0.1:3456`.
- A request through the local proxy reaches the configured `lx` upstream without a transport timeout.
