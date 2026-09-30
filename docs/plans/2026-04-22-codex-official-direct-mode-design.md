# Codex 官方直连模式设计

## 目标

在现有本地代理方案上增加一层更高阶的“运行模式”切换：

- `代理模式`：Codex 的 `base_url` 固定指向本地代理，由代理管理 `cdapi / ttapi`
- `官方模式`：Codex 不再走本地代理，直接切回 OpenAI 官方入口，由用户自己完成退出登录和网页认证

这次不再把 `openapi` 当作普通代理上游处理，而是把它提升为“官方直连模式”。

## 约束

- 最小版本只修改 `~/.codex/config.toml` 中 `model_providers.OpenAI.base_url`
- 不自动改写 `~/.codex/auth.json`
- 如果用户当前 `auth.json` 还是 API Key 模式，页面只负责提示用户手动退出登录并重新网页认证
- 保持本地代理服务本身继续运行，方便用户随时切回 `代理模式`
- 预览实例继续走独立端口，不影响正式 `3456`

## 推荐方案

### 方案 A：双模式单页管理

在管理页增加“运行模式”切换区：

- `代理模式`
- `官方直连`

页面和接口的行为按模式分流：

- `代理模式`
  - 允许切换 `cdapi / ttapi`
  - 继续展示最近请求和 failover
  - 同步 Codex `base_url = http://127.0.0.1:<port>/v1`
- `官方直连`
  - 隐藏或禁用代理平台切换区
  - 明确提示“当前请求不会经过本地代理”
  - 同步 Codex `base_url = https://api.openai.com/v1`
  - 提示用户如需网页登录，请手动退出当前 API Key 登录态

这是推荐方案。语义清楚，改动也最小。

### 方案 B：继续保留 `openapi` 作为第三个代理按钮

点击 `openapi` 时暗中切到官方直连。

不推荐。用户看到的是“平台切换”，实际发生的是“运行模式切换”，语义不一致，后续也很难解释日志、状态和故障行为。

## 配置设计

`~/.codex-router/config.json` 增加字段：

```json
{
  "connectionMode": "proxy"
}
```

含义：

- `proxy`：期望 Codex 走本地代理
- `official`：期望 Codex 直连官方

同时增加一个与 Codex 本机配置交互的模块，专门负责：

- 读取 `~/.codex/config.toml`
- 更新 `model_providers.OpenAI.base_url`
- 推断当前 Codex 实际模式

## 状态模型

`/_router/status` 补充：

- `connectionMode`：代理配置里声明的目标模式
- `codexConnection.mode`：从 `config.toml` 实际解析出的当前模式
- `codexConnection.baseUrl`：当前实际 `base_url`

这样页面可以区分：

- 目标模式
- 实际模式
- 是否有漂移

## 接口设计

新增接口：

- `POST /_router/connection-mode`

请求：

```json
{
  "mode": "proxy"
}
```

或：

```json
{
  "mode": "official"
}
```

行为：

1. 校验模式值
2. 改写 `~/.codex/config.toml`
3. 保存 `~/.codex-router/config.json`
4. 返回最新状态

最小版本不新增“清理登录态”接口，避免误删用户认证信息。

## 页面设计

页面结构调整为两层：

1. 运行模式
   - 代理模式
   - 官方直连
2. 代理平台
   - 仅在代理模式下可操作
   - 只保留 `cdapi / ttapi`

页面文案重点改成：

- 当前是“代理模式”还是“官方直连”
- 官方直连下请求不会经过本地代理
- 如果要网页登录，需要用户自己退出 API Key 登录态

## 风险与边界

- 这次会重新引入对 `~/.codex/config.toml` 的修改，但仅限“运行模式切换”
- 不自动动 `auth.json`，所以不会帮用户完成网页登录切换
- 如果用户手工把 `base_url` 改成其他地址，状态会显示为 `custom`
- 官方模式下本地代理日志不会增长，这是预期行为

## 验证方式

1. 切到 `proxy`
   - `config.toml` 中 `base_url` 为本地代理
   - 页面可切 `cdapi / ttapi`
2. 切到 `official`
   - `config.toml` 中 `base_url` 为 `https://api.openai.com/v1`
   - 页面禁用代理平台切换
   - 页面显示“请求不会经过本地代理”
3. 两种模式来回切换多次，状态一致
