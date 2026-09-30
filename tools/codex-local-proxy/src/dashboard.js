export function getDashboardHtml() {
  return `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Codex 本地代理</title>
    <link rel="stylesheet" href="/_router/ui/app.css">
  </head>
  <body>
    <div class="shell">
      <div class="backdrop-grid" aria-hidden="true"></div>

      <header class="hero">
        <div class="hero-copy">
          <h1>Codex 本地代理</h1>
          <p class="hero-lede">
            固定一个本地入口管理代理链路，统一管理 <code>cdapi</code> / <code>ttapi</code>。
            需要时可以直接切换 Codex 当前的本地代理绑定。
          </p>
          <div class="hero-meta">
            <span>监听地址 <strong id="listen-address">--</strong></span>
          </div>
        </div>

        <div class="hero-plate">
          <div class="plate-caption">实时状态</div>
          <div class="plate-status">
            <span class="plate-led"></span>
            <span id="refresh-indicator">Idle</span>
          </div>
          <button class="refresh-button" id="refresh-button" type="button">刷新面板</button>
        </div>
      </header>

      <main class="console-grid">
        <section class="panel status-panel">
          <div class="panel-head">
            <div>
              <h2>控制台总览</h2>
            </div>
          </div>

          <div class="control-matrix compact-status">
            <article class="summary-chip summary-chip-primary">
              <span class="summary-label">当前生效平台</span>
              <strong id="resolved-platform">--</strong>
              <span class="summary-desc">当前请求统一走这一路由</span>
            </article>
            <article class="summary-chip">
              <span class="summary-label">默认平台</span>
              <strong id="default-platform">--</strong>
              <span class="summary-desc">全局默认出口</span>
            </article>
            <article class="summary-chip">
              <span class="summary-label">已配置平台</span>
              <strong id="configured-platform-count">--</strong>
              <span class="summary-desc">可用上游总数</span>
            </article>
          </div>
        </section>

        <section class="panel rack-panel">
          <div class="panel-head">
            <div>
              <h2>平台配置</h2>
            </div>
            <button class="panel-badge subtle editor-toggle" id="upstream-create-button" type="button">新增上游</button>
          </div>
          <div class="platform-rack" id="platform-config"></div>
        </section>

        <section class="panel switch-panel">
          <div class="panel-head">
            <div>
              <h2>代理操作</h2>
            </div>
          </div>

          <div class="control-matrix switch-actions" id="switchboard">
            <button class="platform-button clear-proxy-button" id="clear-proxy-button" type="button">
              <strong id="proxy-toggle-label">本地代理切换</strong>
              <span class="platform-desc" id="proxy-toggle-desc">根据当前状态切换 Codex 是否接回本地代理</span>
            </button>
          </div>

          <div id="feedback" class="feedback idle">等待操作</div>
          <p class="panel-note" id="proxy-note">当前 Codex 仍经过本地代理，主路由切换会直接影响新请求。</p>
          <p class="panel-note" id="route-note">点击后会直接改写全局默认平台，所有请求都会统一按当前主路由转发。</p>
        </section>

        <section class="panel requests-panel">
          <div class="panel-head">
            <div>
              <h2>最近请求</h2>
            </div>
          </div>
          <div class="requests-shell">
            <div class="requests-table">
              <div class="requests-header">
                <span>时间</span>
                <span>路由</span>
                <span>模型</span>
                <span>状态</span>
                <span>耗时</span>
              </div>
              <div id="request-log" class="requests-body"></div>
            </div>
          </div>
        </section>
      </main>
    </div>

    <div class="upstream-modal-overlay" id="upstream-modal-overlay" hidden></div>
    <div class="upstream-modal" id="upstream-modal" hidden>
      <div class="upstream-modal-head">
        <div>
          <h2 id="upstream-modal-title">新增上游</h2>
          <p id="upstream-modal-desc">填写平台标识、Base URL 和 API Key。</p>
        </div>
        <button class="modal-close" id="upstream-close-button" type="button" aria-label="关闭">×</button>
      </div>
      <form class="upstream-form" id="upstream-form">
        <input id="upstream-form-mode" name="mode" type="hidden" value="create">
        <input id="upstream-form-original-platform" name="originalPlatform" type="hidden" value="">
        <label>
          <span>平台标识</span>
          <input id="upstream-platform" name="platform" type="text" placeholder="例如 mirror" required>
        </label>
        <label>
          <span>Base URL</span>
          <input id="upstream-base-url" name="baseUrl" type="url" placeholder="https://example.com/v1" required>
        </label>
        <label>
          <span>API Key</span>
          <input id="upstream-api-key" name="apiKey" type="text" placeholder="sk-..." value="">
        </label>
        <div class="upstream-form-actions">
          <button class="panel-badge subtle" id="upstream-cancel-button" type="button">取消</button>
          <button class="panel-badge" id="upstream-submit-button" type="submit">保存配置</button>
        </div>
      </form>
    </div>

    <div class="upstream-modal-overlay delete-confirm-overlay" id="delete-confirm-overlay" hidden></div>
    <div class="upstream-modal delete-confirm-modal" id="delete-confirm-modal" hidden>
      <div class="upstream-modal-head">
        <div>
          <h2>确认删除上游</h2>
          <p id="delete-confirm-desc">删除后会立即从主路由切换区移除。</p>
        </div>
        <button class="modal-close" id="delete-confirm-close-button" type="button" aria-label="关闭">×</button>
      </div>
      <div class="delete-confirm-body">
        <p>
          确认删除
          <strong id="delete-confirm-platform">--</strong>
          吗？
        </p>
      </div>
      <div class="upstream-form-actions">
        <button class="panel-badge subtle" id="delete-confirm-cancel-button" type="button">取消</button>
        <button class="panel-badge danger" id="delete-confirm-submit-button" type="button">确认删除</button>
      </div>
    </div>

    <script type="module" src="/_router/ui/app.js"></script>
  </body>
</html>`;
}

export function getDashboardCss() {
  return `:root {
  --bg: #e6e0d5;
  --bg-top: #f0ebe2;
  --panel: rgba(250, 246, 239, 0.94);
  --panel-strong: #f7f2e8;
  --panel-border: rgba(34, 28, 20, 0.16);
  --frame: #2a241b;
  --frame-soft: rgba(42, 36, 27, 0.68);
  --text: #19140f;
  --muted: #5b5042;
  --muted-2: #7f7261;
  --line: rgba(34, 28, 20, 0.1);
  --glow: rgba(255, 243, 218, 0.9);
  --openapi: #1f7a57;
  --cdapi: #a94f16;
  --ttapi: #2952a1;
  --success: #2f8e66;
  --error: #9e3824;
  --shadow: 0 18px 45px rgba(53, 41, 24, 0.12);
  --radius-xl: 28px;
  --radius-lg: 22px;
  --radius-md: 16px;
  --side-column: 430px;
}

* {
  box-sizing: border-box;
}

html {
  color-scheme: light;
}

body {
  margin: 0;
  min-height: 100vh;
  font-family: "IBM Plex Sans", "Segoe UI", sans-serif;
  font-size: 14px;
  color: var(--text);
  background:
    linear-gradient(180deg, var(--bg-top) 0%, var(--bg) 100%);
}

code {
  font-family: "IBM Plex Mono", "SFMono-Regular", monospace;
  font-size: 0.92em;
  padding: 0.1rem 0.32rem;
  border-radius: 6px;
  background: rgba(25, 20, 15, 0.08);
}

button {
  font: inherit;
}

.shell {
  position: relative;
  width: min(1280px, calc(100% - 24px));
  margin: 0 auto;
  padding: 12px 0 16px;
}

.backdrop-grid {
  position: fixed;
  inset: 0;
  pointer-events: none;
  opacity: 0.4;
  background-image:
    linear-gradient(rgba(34, 28, 20, 0.04) 1px, transparent 1px),
    linear-gradient(90deg, rgba(34, 28, 20, 0.04) 1px, transparent 1px);
  background-size: 32px 32px;
  mask-image: linear-gradient(180deg, rgba(0, 0, 0, 0.85), transparent 85%);
}

.hero {
  position: relative;
  display: grid;
  grid-template-columns: minmax(0, 1fr) var(--side-column);
  gap: 12px;
  align-items: stretch;
}

.hero-copy,
.hero-plate,
.panel {
  position: relative;
  overflow: hidden;
  border: 1px solid var(--panel-border);
  box-shadow: var(--shadow);
}

.hero-copy {
  padding: 18px 20px;
  border-radius: var(--radius-xl);
  background:
    radial-gradient(circle at top left, rgba(255, 255, 255, 0.86), transparent 38%),
    linear-gradient(135deg, rgba(247, 241, 231, 0.96), rgba(239, 231, 218, 0.94));
}

.hero-copy::after,
.hero-plate::after,
.panel::after {
  content: "";
  position: absolute;
  inset: 10px;
  border: 1px solid rgba(34, 28, 20, 0.08);
  border-radius: inherit;
  pointer-events: none;
}

.hero-tag,
.panel-kicker,
.plate-caption,
.platform-eyebrow {
  margin: 0;
  font-family: "IBM Plex Mono", "SFMono-Regular", monospace;
  font-size: 0.68rem;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--muted);
}

.hero-copy h1,
.panel h2 {
  margin: 0;
  font-family: "Avenir Next Condensed", "Arial Narrow", sans-serif;
  letter-spacing: -0.04em;
}

.hero-copy h1 {
  margin-top: 4px;
  font-size: clamp(1.28rem, 2vw, 1.96rem);
  line-height: 1;
  font-weight: 700;
}

.hero-lede {
  max-width: 62ch;
  margin: 8px 0 0;
  font-size: 0.76rem;
  line-height: 1.4;
  color: var(--muted);
}

.hero-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-top: 10px;
  font-size: 0.7rem;
  color: var(--muted);
}

.hero-meta strong {
  font-weight: 700;
  color: var(--text);
}

.hero-plate {
  padding: 14px 16px;
  border-radius: var(--radius-xl);
  background:
    linear-gradient(180deg, rgba(43, 37, 29, 0.98), rgba(24, 20, 15, 0.98));
  color: #f8efe2;
  width: 100%;
}

.hero-plate::before,
.switchboard-frame::before,
.platform-rack::before {
  content: "";
  position: absolute;
  inset: 0;
  background:
    linear-gradient(transparent 0, transparent calc(100% - 1px), rgba(255, 255, 255, 0.04) calc(100% - 1px)),
    linear-gradient(90deg, transparent 0, transparent calc(100% - 1px), rgba(255, 255, 255, 0.03) calc(100% - 1px));
  background-size: 100% 42px, 42px 100%;
  pointer-events: none;
}

.plate-status {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  margin-top: 8px;
  padding: 7px 10px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.08);
  font-size: 0.8rem;
}

.plate-led {
  width: 11px;
  height: 11px;
  border-radius: 50%;
  background: #96ef98;
  box-shadow: 0 0 0 5px rgba(150, 239, 152, 0.12), 0 0 18px rgba(150, 239, 152, 0.75);
}

.refresh-button {
  width: 100%;
  min-height: 38px;
  margin-top: 10px;
  padding: 0 14px;
  border-radius: 12px;
  border: 1px solid rgba(255, 255, 255, 0.14);
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.12), rgba(255, 255, 255, 0.05));
  color: #fff3de;
  font-size: 0.82rem;
  font-weight: 600;
  cursor: pointer;
  transition: transform 180ms ease, background-color 180ms ease, box-shadow 180ms ease;
}

.refresh-button:hover,
.platform-button:hover {
  transform: translateY(-1px);
}

.refresh-button:focus-visible,
.platform-button:focus-visible {
  outline: 3px solid rgba(41, 82, 161, 0.2);
  outline-offset: 2px;
}

.console-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) var(--side-column);
  grid-template-areas:
    "status requests"
    "switch requests"
    "rack requests";
  gap: 12px;
  margin-top: 12px;
  align-items: start;
}

.panel {
  padding: 14px;
  border-radius: var(--radius-lg);
  background:
    linear-gradient(180deg, rgba(250, 247, 241, 0.97), rgba(241, 234, 222, 0.92));
}

.status-panel,
.rack-panel,
.requests-panel {
  min-width: 0;
}

.status-panel {
  grid-area: status;
}

.switch-panel {
  grid-area: switch;
  gap: 12px;
}

.rack-panel {
  grid-area: rack;
}

.requests-panel {
  grid-area: requests;
  padding-top: 12px;
  width: 100%;
}

.switch-subhead {
  margin-top: 12px;
}

.panel-head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 12px;
  margin-bottom: 10px;
}

.panel h2 {
  font-size: clamp(0.92rem, 0.92vw, 1.16rem);
  font-weight: 700;
}

.panel-badge {
  display: inline-flex;
  align-items: center;
  min-height: 30px;
  padding: 0 10px;
  border-radius: 999px;
  background: rgba(25, 20, 15, 0.08);
  border: 1px solid rgba(25, 20, 15, 0.1);
  font-family: "IBM Plex Mono", "SFMono-Regular", monospace;
  font-size: 0.62rem;
  letter-spacing: 0.12em;
  color: var(--muted);
}

.panel-badge.subtle {
  background: rgba(255, 255, 255, 0.58);
}

.panel-badge.danger {
  background: rgba(169, 79, 22, 0.14);
  border-color: rgba(169, 79, 22, 0.18);
  color: #8d3d12;
}

.control-matrix {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
}

.summary-chip {
  position: relative;
  padding: 12px;
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.74);
  border: 1px solid rgba(34, 28, 20, 0.12);
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.48);
}

.summary-chip-primary {
  background: linear-gradient(180deg, #242018 0%, #15120e 100%);
  border-color: rgba(255, 255, 255, 0.08);
  color: #f8f1e2;
}

.summary-label {
  display: block;
  margin: 0;
  font-family: "IBM Plex Mono", "SFMono-Regular", monospace;
  font-size: 0.62rem;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--muted-2);
}

.summary-chip-primary .summary-label {
  color: rgba(248, 241, 226, 0.72);
}

.summary-chip strong {
  display: block;
  margin-top: 8px;
  font-family: "Avenir Next Condensed", "Arial Narrow", sans-serif;
  font-size: 1.1rem;
  line-height: 1;
  letter-spacing: -0.04em;
  font-weight: 700;
  color: var(--text);
}

.summary-chip-primary strong {
  color: var(--glow);
}

.summary-desc {
  display: block;
  margin-top: 8px;
  font-size: 0.68rem;
  line-height: 1.3;
  color: var(--muted);
}

.summary-chip-primary .summary-desc {
  color: rgba(248, 241, 226, 0.66);
}

.switchboard-frame,
.platform-rack {
  position: relative;
  padding: 12px;
  border-radius: 18px;
  background: linear-gradient(180deg, rgba(34, 28, 20, 0.06), rgba(34, 28, 20, 0.02));
  border: 1px solid rgba(34, 28, 20, 0.1);
}

.switch-actions {
  align-items: stretch;
}

.platform-button {
  position: relative;
  width: 100%;
  min-height: 86px;
  display: grid;
  gap: 2px;
  align-content: center;
  padding: 10px 12px;
  border-radius: 16px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  color: white;
  text-align: left;
  cursor: pointer;
  box-shadow: 0 12px 24px rgba(25, 20, 15, 0.14);
  transition: transform 180ms ease, box-shadow 180ms ease, filter 180ms ease;
}

.platform-button:disabled {
  cursor: not-allowed;
  opacity: 0.52;
  box-shadow: none;
  filter: grayscale(0.18);
}

.platform-button strong,
.platform-desc {
  display: block;
}

.platform-button strong {
  font-family: "Avenir Next Condensed", "Arial Narrow", sans-serif;
  font-size: 0.88rem;
  letter-spacing: -0.04em;
  font-weight: 700;
}

.platform-desc {
  font-size: 0.68rem;
  line-height: 1.25;
  color: rgba(255, 255, 255, 0.78);
}

.platform-button.is-active {
  box-shadow:
    0 0 0 3px rgba(255, 255, 255, 0.68),
    0 14px 28px rgba(25, 20, 15, 0.18);
  filter: saturate(1.08);
}

.platform-button.is-disabled::after {
  content: "不可用";
  position: absolute;
  right: 12px;
  top: 10px;
  padding: 2px 7px;
  border-radius: 999px;
  background: rgba(25, 20, 15, 0.2);
  border: 1px solid rgba(255, 255, 255, 0.16);
  font-family: "IBM Plex Mono", "SFMono-Regular", monospace;
  font-size: 0.62rem;
  letter-spacing: 0.08em;
  color: rgba(255, 255, 255, 0.9);
}

.platform-openapi {
  background: linear-gradient(135deg, #1d6f52, #2f9a72);
}

.platform-cdapi {
  background: linear-gradient(135deg, #8d3d12, #c46a1f);
}

.platform-ttapi {
  background: linear-gradient(135deg, #1e468f, #3b68c6);
}

.clear-proxy-button {
  background: linear-gradient(135deg, #5d3528, #996247);
}

.panel-note {
  margin: 6px 0 0;
  font-size: 0.68rem;
  line-height: 1.3;
  color: var(--muted);
}

.platform-rack {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
}

.upstream-form {
  display: grid;
  grid-template-columns: 1fr;
  gap: 8px;
}

.upstream-form label {
  display: grid;
  gap: 4px;
  font-size: 0.68rem;
  color: var(--muted);
}

.upstream-form input {
  width: 100%;
  min-height: 36px;
  padding: 0 10px;
  border-radius: 12px;
  border: 1px solid rgba(34, 28, 20, 0.12);
  background: rgba(255, 255, 255, 0.88);
  color: var(--text);
}

.upstream-form-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
}

.upstream-form-actions .panel-badge,
.editor-toggle {
  cursor: pointer;
}

.upstream-modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(20, 16, 12, 0.42);
  backdrop-filter: blur(5px);
  z-index: 20;
}

.upstream-modal {
  position: fixed;
  top: 50%;
  left: 50%;
  width: min(520px, calc(100% - 32px));
  padding: 16px;
  border-radius: 22px;
  border: 1px solid var(--panel-border);
  background:
    linear-gradient(180deg, rgba(250, 247, 241, 0.98), rgba(241, 234, 222, 0.96));
  box-shadow: 0 28px 60px rgba(25, 20, 15, 0.26);
  transform: translate(-50%, -50%);
  z-index: 21;
}

.upstream-modal[hidden],
.upstream-modal-overlay[hidden] {
  display: none;
}

.upstream-modal-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
}

.upstream-modal-head h2 {
  margin: 0;
}

.upstream-modal-head p {
  margin: 6px 0 0;
  font-size: 0.7rem;
  color: var(--muted);
}

.delete-confirm-body {
  margin-bottom: 12px;
  padding: 12px;
  border-radius: 16px;
  border: 1px solid rgba(34, 28, 20, 0.08);
  background: rgba(255, 255, 255, 0.62);
}

.delete-confirm-body p {
  margin: 0;
  font-size: 0.74rem;
  line-height: 1.45;
  color: var(--muted);
}

.delete-confirm-body strong {
  color: var(--text);
}

.modal-close {
  width: 34px;
  height: 34px;
  border: 1px solid rgba(34, 28, 20, 0.12);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.82);
  color: var(--text);
  cursor: pointer;
}

.requests-shell {
  padding: 10px;
  border-radius: 18px;
  background: linear-gradient(180deg, rgba(34, 28, 20, 0.06), rgba(34, 28, 20, 0.02));
  border: 1px solid rgba(34, 28, 20, 0.1);
}

.requests-table {
  overflow: hidden;
  border-radius: 14px;
  border: 1px solid rgba(34, 28, 20, 0.08);
  background: rgba(255, 255, 255, 0.72);
}

.requests-header,
.request-row {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 10px;
  align-items: center;
}

.requests-header {
  padding: 8px 10px;
  background: rgba(25, 20, 15, 0.06);
  border-bottom: 1px solid rgba(34, 28, 20, 0.08);
  font-family: "IBM Plex Mono", "SFMono-Regular", monospace;
  font-size: 0.54rem;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--muted);
  text-align: center;
}

.requests-body {
  overflow: visible;
}

.request-row {
  padding: 8px 10px;
  border-top: 1px solid rgba(34, 28, 20, 0.06);
  font-size: 0.74rem;
}

.request-row:first-child {
  border-top: 0;
}

.request-route {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}

.request-route-label {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
}

.request-route::before {
  content: "";
  width: 7px;
  height: 7px;
  border-radius: 50%;
  flex: 0 0 auto;
}

.request-route.openapi::before {
  background: var(--openapi);
}

.request-route.cdapi::before {
  background: var(--cdapi);
}

.request-route.ttapi::before {
  background: var(--ttapi);
}

.request-model {
  min-width: 0;
  font-weight: 600;
}

.request-model,
.request-route,
.request-time {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.request-time,
.request-route,
.request-model,
.request-row > span:last-child,
.request-row > span:nth-child(4) {
  text-align: center;
}

.status-pill {
  display: inline-flex;
  justify-content: center;
  align-items: center;
  min-height: 22px;
  min-width: 40px;
  padding: 0 7px;
  border-radius: 999px;
  border: 1px solid rgba(34, 28, 20, 0.1);
  font-weight: 700;
  font-size: 0.62rem;
}

.status-pill.ok {
  color: #207547;
  background: rgba(224, 251, 232, 0.96);
}

.status-pill.error {
  color: #b03c24;
  background: rgba(255, 238, 232, 0.96);
}

.request-empty {
  padding: 12px 10px;
  font-size: 0.74rem;
  color: var(--muted);
}

.platform-chip {
  position: relative;
  padding: 12px;
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.72);
  border: 1px solid rgba(34, 28, 20, 0.12);
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.45);
}

.platform-chip strong,
.platform-chip span {
  display: block;
}

.platform-chip-actions {
  display: flex;
  gap: 8px;
  margin-top: 8px;
}

.platform-chip-actions button {
  min-height: 28px;
  padding: 0 10px;
  border-radius: 999px;
  border: 1px solid rgba(34, 28, 20, 0.12);
  background: rgba(255, 255, 255, 0.78);
  color: var(--text);
  cursor: pointer;
}

.platform-button.platform-generic {
  background: linear-gradient(135deg, #4d5666, #76839b);
}

.platform-chip strong {
  font-family: "Avenir Next Condensed", "Arial Narrow", sans-serif;
  font-size: 0.78rem;
  letter-spacing: -0.03em;
  font-weight: 700;
}

.platform-chip span {
  margin-top: 4px;
  font-size: 0.68rem;
  line-height: 1.32;
  color: var(--muted);
  word-break: break-all;
}

.platform-chip::before {
  content: "";
  position: absolute;
  left: 12px;
  top: 12px;
  width: 7px;
  height: 7px;
  border-radius: 50%;
  box-shadow: 0 0 0 5px rgba(255, 255, 255, 0.6);
}

.platform-chip strong {
  padding-left: 16px;
}

.platform-chip.openapi::before {
  background: var(--openapi);
}

.platform-chip.cdapi::before {
  background: var(--cdapi);
}

.platform-chip.ttapi::before {
  background: var(--ttapi);
}

.feedback {
  min-height: 36px;
  display: flex;
  align-items: center;
  margin-top: 8px;
  padding: 8px 10px;
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.78);
  border: 1px solid rgba(34, 28, 20, 0.1);
  line-height: 1.25;
  font-size: 0.68rem;
}

.feedback.success {
  border-color: rgba(47, 142, 102, 0.32);
  background: rgba(240, 252, 245, 0.96);
}

.feedback.error {
  border-color: rgba(158, 56, 36, 0.28);
  background: rgba(255, 244, 240, 0.96);
}

@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation: none !important;
    transition: none !important;
    scroll-behavior: auto !important;
  }
}

@media (max-width: 1080px) {
  .hero,
  .console-grid,
  .control-matrix,
  .platform-rack,
  .requests-header,
  .request-row {
    grid-template-columns: 1fr;
  }

  .switch-panel,
  .status-panel,
  .rack-panel,
  .requests-panel {
    grid-column: auto;
    grid-row: auto;
  }
}

@media (max-width: 720px) {
  .shell {
    width: min(100% - 20px, 1320px);
    padding-top: 12px;
  }

  .hero-copy,
  .hero-plate,
  .panel {
    padding-left: 18px;
    padding-right: 18px;
  }

  .hero-copy h1 {
    font-size: 1.8rem;
  }

  .main-readout strong {
    font-size: 2.3rem;
  }
}`;
}

export function getDashboardJs() {
  return `const state = {
  currentPlatform: null,
  autoRefreshTimer: null,
  routablePlatforms: new Set(),
  codexConnectionMode: "unknown",
  upstreams: {}
};

const refs = {
  refreshButton: document.querySelector("#refresh-button"),
  clearProxyButton: document.querySelector("#clear-proxy-button"),
  proxyToggleLabel: document.querySelector("#proxy-toggle-label"),
  proxyToggleDesc: document.querySelector("#proxy-toggle-desc"),
  refreshIndicator: document.querySelector("#refresh-indicator"),
  defaultPlatform: document.querySelector("#default-platform"),
  resolvedPlatform: document.querySelector("#resolved-platform"),
  configuredPlatformCount: document.querySelector("#configured-platform-count"),
  listenAddress: document.querySelector("#listen-address"),
  platformConfig: document.querySelector("#platform-config"),
  requestLog: document.querySelector("#request-log"),
  feedback: document.querySelector("#feedback"),
  proxyNote: document.querySelector("#proxy-note"),
  routeNote: document.querySelector("#route-note"),
  switchboard: document.querySelector("#switchboard"),
  upstreamForm: document.querySelector("#upstream-form"),
  upstreamCreateButton: document.querySelector("#upstream-create-button"),
  upstreamCancelButton: document.querySelector("#upstream-cancel-button"),
  upstreamCloseButton: document.querySelector("#upstream-close-button"),
  upstreamFormMode: document.querySelector("#upstream-form-mode"),
  upstreamFormOriginalPlatform: document.querySelector("#upstream-form-original-platform"),
  upstreamPlatform: document.querySelector("#upstream-platform"),
  upstreamBaseUrl: document.querySelector("#upstream-base-url"),
  upstreamApiKey: document.querySelector("#upstream-api-key"),
  upstreamModal: document.querySelector("#upstream-modal"),
  upstreamModalOverlay: document.querySelector("#upstream-modal-overlay"),
  upstreamModalTitle: document.querySelector("#upstream-modal-title"),
  upstreamModalDesc: document.querySelector("#upstream-modal-desc"),
  deleteConfirmOverlay: document.querySelector("#delete-confirm-overlay"),
  deleteConfirmModal: document.querySelector("#delete-confirm-modal"),
  deleteConfirmDesc: document.querySelector("#delete-confirm-desc"),
  deleteConfirmPlatform: document.querySelector("#delete-confirm-platform"),
  deleteConfirmCancelButton: document.querySelector("#delete-confirm-cancel-button"),
  deleteConfirmCloseButton: document.querySelector("#delete-confirm-close-button"),
  deleteConfirmSubmitButton: document.querySelector("#delete-confirm-submit-button")
};

function setFeedback(message, type = "idle") {
  refs.feedback.className = "feedback " + type;
  refs.feedback.textContent = message;
}

function setRefreshing(active) {
  refs.refreshIndicator.textContent = active ? "Loading" : "Idle";
  refs.refreshButton.disabled = active;
}

function formatPlatformLabel(value) {
  return value || "未设置";
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

async function requestJson(path, init) {
  const response = await fetch(path, {
    headers: {
      "content-type": "application/json",
      ...(init?.headers || {})
    },
    ...init
  });
  const payload = await response.json();

  if (!response.ok) {
    throw new Error(payload.error || "Request failed");
  }

  return payload;
}

function renderPlatforms(upstreams) {
  refs.platformConfig.innerHTML = Object.entries(upstreams)
    .map(([platform, item]) => {
      const configuredLabel = item.hasApiKey ? "稳定 API Key 已配置" : "当前不可用";
      return \`
        <article class="platform-chip \${platform}">
          <strong>\${platform}</strong>
          <span>\${item.baseUrl}</span>
          <span>\${configuredLabel}</span>
          <div class="platform-chip-actions">
            <button type="button" data-edit-platform="\${platform}">编辑</button>
            <button type="button" data-delete-platform="\${platform}">删除</button>
          </div>
        </article>
      \`;
    })
    .join("");

  refs.platformConfig.querySelectorAll("[data-edit-platform]").forEach((button) => {
    button.addEventListener("click", () => {
      const platform = button.dataset.editPlatform;
      const upstream = state.upstreams[platform];

      openUpstreamModal({
        mode: "edit",
        platform,
        upstream
      });
      setFeedback(\`正在编辑 \${platform}\`, "idle");
    });
  });

  refs.platformConfig.querySelectorAll("[data-delete-platform]").forEach((button) => {
    button.addEventListener("click", () => {
      openDeleteConfirmModal(button.dataset.deletePlatform);
    });
  });
}

function renderActivePlatform(platform) {
  state.currentPlatform = platform || null;
  refs.switchboard.querySelectorAll("[data-platform]").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.platform === state.currentPlatform);
  });
}

function renderPlatformAvailability(upstreams) {
  refs.switchboard.querySelectorAll("[data-platform]").forEach((button) => {
    const platform = button.dataset.platform;
    const upstream = upstreams[platform];
    const isAvailable = Boolean(upstream?.hasApiKey)
      && state.routablePlatforms.has(platform);
    button.disabled = !isAvailable;
    button.classList.toggle("is-disabled", !isAvailable);
    button.title = isAvailable
      ? ""
      : "该平台未配置稳定 API Key，当前不参与切换和自动回退";
  });
}

function renderProxyToggle(isProxyAttached) {
  refs.proxyToggleLabel.textContent = isProxyAttached ? "清除本地代理" : "接管 Codex";
  refs.proxyToggleDesc.textContent = isProxyAttached
    ? "当前 Codex 已接入本地代理，点击后会清除当前绑定。"
    : "当前 Codex 未经过本地代理，点击后会重新接回当前监听地址。";
}

function getPlatformButtonClass(platform) {
  if (platform === "openapi" || platform === "cdapi" || platform === "ttapi") {
    return \`platform-\${platform}\`;
  }

  return "platform-generic";
}

function getPlatformDescription(platform, upstream) {
  if (platform === "openapi") {
    return "官方 OpenAI 入口";
  }

  if (platform === "cdapi") {
    return "当前默认常用链路";
  }

  if (platform === "ttapi") {
    return "备用上游与扩展模型池";
  }

  return upstream?.baseUrl || "自定义上游";
}

function resetUpstreamForm() {
  refs.upstreamForm.reset();
  refs.upstreamFormMode.value = "create";
  refs.upstreamFormOriginalPlatform.value = "";
  refs.upstreamPlatform.disabled = false;
}

function openUpstreamModal({ mode = "create", platform = "", upstream = null } = {}) {
  refs.upstreamFormMode.value = mode;
  refs.upstreamFormOriginalPlatform.value = platform;
  refs.upstreamPlatform.disabled = mode === "edit";
  refs.upstreamPlatform.value = platform;
  refs.upstreamBaseUrl.value = upstream?.baseUrl || "";
  refs.upstreamApiKey.value = "";
  refs.upstreamModalTitle.textContent = mode === "edit" ? \`编辑 \${platform}\` : "新增上游";
  refs.upstreamModalDesc.textContent = mode === "edit"
    ? "修改当前上游的 Base URL 和 API Key。"
    : "填写平台标识、Base URL 和 API Key。";
  refs.upstreamModal.hidden = false;
  refs.upstreamModalOverlay.hidden = false;
  if (mode === "edit") {
    refs.upstreamBaseUrl.focus();
    return;
  }
  refs.upstreamPlatform.focus();
}

function closeUpstreamModal() {
  refs.upstreamModal.hidden = true;
  refs.upstreamModalOverlay.hidden = true;
  resetUpstreamForm();
}

function openDeleteConfirmModal(platform) {
  refs.deleteConfirmPlatform.textContent = platform;
  refs.deleteConfirmDesc.textContent = \`确认删除上游 \${platform}。删除后会立即从主路由切换区移除；若它是当前默认平台，系统会自动切到新的可用平台。\`;
  refs.deleteConfirmSubmitButton.dataset.platform = platform;
  refs.deleteConfirmModal.hidden = false;
  refs.deleteConfirmOverlay.hidden = false;
  refs.deleteConfirmSubmitButton.focus();
}

function closeDeleteConfirmModal() {
  refs.deleteConfirmModal.hidden = true;
  refs.deleteConfirmOverlay.hidden = true;
  refs.deleteConfirmSubmitButton.dataset.platform = "";
}

function renderSwitchboard(upstreams) {
  const dynamicButtons = Object.entries(upstreams)
    .map(([platform, upstream]) => \`
      <button class="platform-button \${getPlatformButtonClass(platform)}" data-platform="\${platform}" type="button">
        <strong>\${platform.toUpperCase()}</strong>
        <span class="platform-desc">\${escapeHtml(getPlatformDescription(platform, upstream))}</span>
      </button>
    \`)
    .join("");

  refs.switchboard.innerHTML = \`
    <button class="platform-button clear-proxy-button" id="clear-proxy-button" type="button">
      <strong id="proxy-toggle-label">\${escapeHtml(refs.proxyToggleLabel?.textContent || "本地代理切换")}</strong>
      <span class="platform-desc" id="proxy-toggle-desc">\${escapeHtml(refs.proxyToggleDesc?.textContent || "根据当前状态切换 Codex 是否接回本地代理")}</span>
    </button>
    \${dynamicButtons}
  \`;

  refs.clearProxyButton = refs.switchboard.querySelector("#clear-proxy-button");
  refs.proxyToggleLabel = refs.switchboard.querySelector("#proxy-toggle-label");
  refs.proxyToggleDesc = refs.switchboard.querySelector("#proxy-toggle-desc");

  refs.clearProxyButton.addEventListener("click", () => {
    handleAction(() => toggleProxyBinding());
  });

  refs.switchboard.querySelectorAll("[data-platform]").forEach((button) => {
    button.addEventListener("click", () => {
      if (button.disabled) {
        return;
      }
      handleAction(() => setDefaultPlatform(button.dataset.platform));
    });
  });
}

function formatRelativeTime(value) {
  if (!value) {
    return "--";
  }

  const diffMs = Date.now() - new Date(value).getTime();
  const diffSeconds = Math.max(0, Math.floor(diffMs / 1000));

  if (diffSeconds < 60) {
    return \`\${diffSeconds}秒前\`;
  }

  const diffMinutes = Math.floor(diffSeconds / 60);

  if (diffMinutes < 60) {
    return \`\${diffMinutes}分钟前\`;
  }

  const diffHours = Math.floor(diffMinutes / 60);
  return \`\${diffHours}小时前\`;
}

function renderRequests(items = []) {
  if (!items.length) {
    refs.requestLog.innerHTML = '<div class="request-empty">还没有经过代理的新请求</div>';
    return;
  }

  refs.requestLog.innerHTML = items
    .map((item) => {
      const statusClass = item.statusCode >= 200 && item.statusCode < 400 ? "ok" : "error";
      const model = item.model || item.path || "--";
      const safeModel = escapeHtml(model);
      const actualPlatform = escapeHtml(item.platform);
      const routeLabel = item.failover && item.primaryPlatform
        ? \`\${escapeHtml(item.primaryPlatform)} -> \${actualPlatform}\`
        : actualPlatform;
      const attemptTitle = Array.isArray(item.attempts)
        ? escapeHtml(item.attempts.map((attempt) => \`\${attempt.platform}:\${attempt.statusCode}\`).join(" | "))
        : "";
      return \`
        <div class="request-row">
          <span class="request-time">\${formatRelativeTime(item.createdAt)}</span>
          <span class="request-route \${actualPlatform}" title="\${attemptTitle}">
            <span class="request-route-label">\${routeLabel}</span>
          </span>
          <span class="request-model" title="\${safeModel}">\${safeModel}</span>
          <span><span class="status-pill \${statusClass}">\${item.statusCode}</span></span>
          <span>\${item.durationMs}ms</span>
        </div>
      \`;
    })
    .join("");
}

function renderStatus(payload) {
  const upstreams = payload.upstreams || {};
  state.upstreams = upstreams;
  const configuredCount = Object.values(upstreams).filter((item) => item.hasApiKey).length;
  const supportedCount = Object.keys(upstreams).length;
  state.routablePlatforms = new Set(payload.routablePlatforms || []);
  state.codexConnectionMode = payload.codexConnection?.mode || "unknown";
  const isProxyAttached = payload.codexConnection?.mode === "proxy";

  refs.defaultPlatform.textContent = formatPlatformLabel(payload.defaultPlatform);
  refs.resolvedPlatform.textContent = isProxyAttached
    ? formatPlatformLabel(payload.resolved?.platform)
    : "未接管";
  refs.configuredPlatformCount.textContent = supportedCount > 0 ? \`\${configuredCount} / \${supportedCount}\` : "0";
  refs.listenAddress.textContent = \`\${payload.listenHost}:\${payload.listenPort}\`;
  refs.proxyNote.textContent = isProxyAttached
    ? "当前 Codex 仍经过本地代理，主路由切换会直接影响新请求。"
    : "当前 Codex 已清除本地代理，下面的主路由切换只会修改本地代理配置。";
  refs.routeNote.textContent = isProxyAttached
    ? "点击后会直接改写全局默认平台，所有请求都会统一按当前主路由转发。"
    : "点击后会改写本地代理的默认平台；只有重新接回本地代理后才会对 Codex 生效。";
  renderSwitchboard(upstreams);
  renderProxyToggle(isProxyAttached);
  renderPlatforms(upstreams);
  renderPlatformAvailability(upstreams);
  renderActivePlatform(payload.defaultPlatform);
}

async function fetchStatus() {
  setRefreshing(true);
  try {
    const payload = await requestJson("/_router/status");
    renderStatus(payload);
    return payload;
  } finally {
    setRefreshing(false);
  }
}

async function fetchRequests() {
  const payload = await requestJson("/_router/requests?limit=10");
  renderRequests(payload.items || []);
  return payload;
}

async function refreshAll() {
  setRefreshing(true);
  try {
    const [statusPayload] = await Promise.all([
      requestJson("/_router/status"),
      fetchRequests()
    ]);
    renderStatus(statusPayload);
    return statusPayload;
  } finally {
    setRefreshing(false);
  }
}

async function setDefaultPlatform(platform) {
  const payload = await requestJson("/_router/default-platform", {
    method: "POST",
    body: JSON.stringify({ platform })
  });
  renderStatus(payload);
  setFeedback(\`已切换全局默认平台到 \${platform}\`, "success");
}

async function toggleProxyBinding() {
  const wasProxyAttached = state.codexConnectionMode === "proxy";
  const payload = await requestJson("/_router/toggle-proxy", {
    method: "POST",
    body: JSON.stringify({})
  });
  renderStatus(payload);
  setFeedback(
    wasProxyAttached ? "已清除 Codex 当前本地代理" : "已重新接管 Codex 到本地代理",
    "success"
  );
}

async function submitUpstreamForm() {
  const mode = refs.upstreamFormMode.value;
  const originalPlatform = refs.upstreamFormOriginalPlatform.value;
  const payload = {
    platform: refs.upstreamPlatform.value.trim(),
    baseUrl: refs.upstreamBaseUrl.value.trim(),
    apiKey: refs.upstreamApiKey.value.trim()
  };

  const requestPath = mode === "edit"
    ? \`/_router/upstreams/\${encodeURIComponent(originalPlatform)}\`
    : "/_router/upstreams";
  const method = mode === "edit" ? "PUT" : "POST";

  const response = await requestJson(requestPath, {
    method,
    body: JSON.stringify(payload)
  });

  renderStatus(response);
  closeUpstreamModal();
  setFeedback(mode === "edit" ? \`已更新 \${originalPlatform}\` : \`已新增 \${payload.platform}\`, "success");
}

async function deleteUpstream(platform) {
  const payload = await requestJson(\`/_router/upstreams/\${encodeURIComponent(platform)}\`, {
    method: "DELETE"
  });

  renderStatus(payload);
  setFeedback(\`已删除 \${platform}\`, "success");
}

async function handleAction(action) {
  try {
    setFeedback("处理中...", "idle");
    await action();
    await refreshAll();
  } catch (error) {
    setFeedback(error.message || "操作失败", "error");
  }
}

refs.refreshButton.addEventListener("click", () => {
  handleAction(() => refreshAll());
});

refs.upstreamCreateButton.addEventListener("click", () => {
  openUpstreamModal();
});

refs.upstreamCancelButton.addEventListener("click", () => {
  closeUpstreamModal();
  setFeedback("已取消编辑", "idle");
});

refs.upstreamCloseButton.addEventListener("click", () => {
  closeUpstreamModal();
});

refs.upstreamModalOverlay.addEventListener("click", () => {
  closeUpstreamModal();
});

refs.deleteConfirmCancelButton.addEventListener("click", () => {
  closeDeleteConfirmModal();
  setFeedback("已取消删除", "idle");
});

refs.deleteConfirmCloseButton.addEventListener("click", () => {
  closeDeleteConfirmModal();
});

refs.deleteConfirmOverlay.addEventListener("click", () => {
  closeDeleteConfirmModal();
});

refs.deleteConfirmSubmitButton.addEventListener("click", () => {
  const { platform } = refs.deleteConfirmSubmitButton.dataset;
  if (!platform) {
    return;
  }
  closeDeleteConfirmModal();
  handleAction(() => deleteUpstream(platform));
});

refs.upstreamForm.addEventListener("submit", (event) => {
  event.preventDefault();
  handleAction(() => submitUpstreamForm());
});

document.addEventListener("keydown", (event) => {
  if (event.key !== "Escape") {
    return;
  }

  if (!refs.deleteConfirmModal.hidden) {
    closeDeleteConfirmModal();
    return;
  }

  if (!refs.upstreamModal.hidden) {
    closeUpstreamModal();
  }
});

state.autoRefreshTimer = setInterval(() => {
  refreshAll().catch(() => {});
}, 5000);

refreshAll().catch((error) => {
  setFeedback(error.message || "初始化失败", "error");
});`;
}
