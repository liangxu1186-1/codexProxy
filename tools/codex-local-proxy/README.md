# Codex 本地代理

一个给 Codex 使用的本地 OpenAI 兼容代理。Codex 固定连本地入口，真正使用哪套上游由本地代理统一控制。

## 当前定位

- 固定本地入口：`http://127.0.0.1:3456/v1`
- 全局主路由只管理 `cdapi` / `ttapi`
- 页面可切换全局默认平台
- 页面可一键清除 Codex 当前的本地代理绑定
- 不再提供“官方直连模式”页面切换

## 配置文件

代理配置保存在：

- `~/.codex-router/config.json`

Codex 自身配置保存在：

- `~/.codex/config.toml`

首次启动或执行 `npm run init-config` 时，如果 `~/.codex-router/config.json` 不存在，程序会自动生成默认配置。

最小示例：

```json
{
  "listenHost": "127.0.0.1",
  "listenPort": 3456,
  "defaultPlatform": "cdapi",
  "upstreams": {
    "openapi": {
      "baseUrl": "https://api.openai.com/v1",
      "apiKey": ""
    },
    "cdapi": {
      "baseUrl": "https://coding.caodong.host/v1",
      "apiKey": "cd-..."
    },
    "ttapi": {
      "baseUrl": "https://w.ciykj.cn",
      "apiKey": "tt-..."
    }
  }
}
```

说明：

- `openapi` 只保留配置位，不参与主路由切换
- 默认平台建议只在 `cdapi` 和 `ttapi` 之间切换
- 缺省配置的默认平台是 `cdapi`

## 启动

正式实例：

```bash
cd /Users/shouqianba/Desktop/liangxu/code2/codexProxy/tools/codex-local-proxy
npm run start
```

默认监听：

- `http://127.0.0.1:3456`

预览实例：

```bash
cd /Users/shouqianba/Desktop/liangxu/code2/codexProxy/tools/codex-local-proxy
npm run start:preview
```

默认监听：

- `http://127.0.0.1:3457`

预览实例只用于看页面和验新逻辑，不影响正式实例。

如果启动时报端口占用，程序会直接提示具体监听地址。

## 打包为 macOS 可分发目录

当前提供的是 `macOS` 下的可分发目录，不是 `.app`。

执行：

```bash
cd /Users/shouqianba/Desktop/liangxu/code2/codexProxy/tools/codex-local-proxy
npm run package:macos
```

产物会生成到：

- `dist/codex-local-proxy-macos-v<version>/`

目录内会包含：

- `runtime/bin/node`：随包携带的当前 Node 运行时
- `app/`：代理源码和初始化脚本
- `bin/start.command`：启动正式实例
- `bin/start-preview.command`：启动预览实例
- `bin/stop.command`：停止后台进程
- `bin/status.command`：查看运行状态
- `bin/open-dashboard.command`：打开管理页

这套产物的边界：

- 只面向 `macOS`
- 默认适合同架构机器直接复制使用
- 这一步解决的是“别的电脑能跑”，不是“桌面应用壳子”

## Codex 配置方式

Codex 使用本地代理时，OpenAI provider 需要指向：

- `base_url = "http://127.0.0.1:3456/v1"`

如果你在页面上点击“清除本地代理”，程序会删除 `~/.codex/config.toml` 中 OpenAI provider 的 `base_url`。

每次改写 `~/.codex/config.toml` 前，程序都会先备份原文件到：

- `~/.codex-router/backups/`

## 管理页

启动后可直接打开：

- [http://127.0.0.1:3456/](http://127.0.0.1:3456/)

页面当前能力：

- 查看当前默认平台、实际可路由平台、监听地址、最近请求
- 切换全局默认平台：`cdapi` / `ttapi`
- 清除 Codex 当前的本地代理绑定

最近请求默认只保留和展示最新 `10` 条。

## CLI

```bash
cd /Users/shouqianba/Desktop/liangxu/code2/codexProxy/tools/codex-local-proxy
npm run cli -- status
npm run cli -- use cdapi
npm run cli -- switch ttapi
npm run cli -- clear-proxy
```

命令说明：

- `status [path]`：查看当前状态
- `use <platform>`：切换全局默认平台
- `switch <platform>`：同 `use`
- `clear-proxy`：清除 Codex 当前的本地代理 `base_url`

## 管理接口

- `GET /_router/status`
- `GET /_router/requests`
- `POST /_router/default-platform`
- `POST /_router/clear-proxy`

## 支持的代理接口

- `POST /v1/responses`
- `POST /v1/chat/completions`
- `GET /v1/models`

其他 `/v1/*` 路径当前也会透传到命中的上游。

## 自动故障切换

代理支持请求级 failover，不会改写全局默认平台。

- 先按当前全局默认平台选择首选上游
- 如果首选平台返回 `408`、`429`、`5xx`，或请求直接超时 / 连接失败，会继续尝试下一个已配置上游
- 如果首选平台返回 `4xx`，默认不切换，直接把错误返回给客户端
- 只影响当前这一次请求，`defaultPlatform` 不会被自动改掉

响应头会带上：

- `x-codex-router-platform`：最终实际命中的平台
- `x-codex-router-primary-platform`：原始首选平台
- `x-codex-router-failover`：这次请求是否发生了切换

## 已知边界

- 最近请求记录当前是内存态，代理重启后会清空
- “清除本地代理”只处理 `config.toml` 的 `base_url`，不会自动修改 `auth.json`
- `openapi` 如果需要网页登录认证，当前版本不代管这条登录链路
- 项目级路由能力仍在代码里，但当前产品界面和默认用法都按全局主路由收口
