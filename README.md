# DSH Lumen

DSH Lumen 是一个 DSH Web 外部插件，用于在当前会话内提供「知识透镜 / Knowledge Lens」查询面板。

## 当前能力

- 作为普通 Cordis 插件行加载 Host half：`src/index.ts`。
- 作为 DSH Web client plugin 加载 Browser half：`src/client/index.ts`。
- 通过 DSH slot system 注册到 `conversation.input.dock`，不做 DOM-level 全局监听或手工浮层注入。
- 通过 DSH Typert Remote/API Gateway 从浏览器调用 Host service。
- Host service 通过 `ctx.llm.stream()` 调用 DSH 当前配置的 LLM adapter，不在浏览器端读取密钥或直接请求 provider API。
- 支持 `quick` 和 `contextual` 两种查询模式；`contextual` 会读取当前 session 最近消息作为上下文，但不会写入主会话日志。

## 文件结构

```text
dsh-lumen/
  package.json
  tsconfig.json
  src/index.ts
  src/types.ts
  src/remote.ts
  src/css-modules.d.ts
  src/client/index.ts
  src/client/LumenDock.tsx
  src/client/LumenDock.module.css
  debug/dsh-lumen.cordis.patch.yml
  scripts/build.mjs
  scripts/watch.mjs
  scripts/dev-web.mjs
```

`lib/` 是构建产物，不要手写。

## DSH 插件规约

DSH Web client plugin 是双半侧包：

- Host half：`exports["."]` 指向 `lib/index.js`，由 Cordis Loader 在 Node 侧加载。
- Browser half：`exports["./client"]` 指向 `lib/client.js`，由 DSH client module loader 加载。
- Manifest：`package.json#dsh.client.platform = "web"` 声明 Web client plugin。
- Client 组合：只能通过 `ctx.slots.register()` / `ctx.slots.inject()` 进入 UI slot。
- Remote 调用：Browser half 通过 `ctx.remote.$mount(TYPERT_REMOTE)` 挂载本包的 strict Remote contribution。

当前 Lumen 注册的是 `conversation.input.dock`，这是会话作用域的 composer 上方扩展区。

## 本地调试

严格插件生态开发不手改 DSH checkout 或 profile 的 `node_modules`。首次调试可以直接运行：

```bash
DSH_ROOT=/path/to/deepseek-harness pnpm dev:all
```

这会先构建插件，再通过 DSH 源码仓库里的 `pnpm dsh plugin --profile web add ...` 安装当前 checkout，最后启动 Web 开发服务。

如果需要拆开执行，先让 DSH profile 用官方插件命令安装当前 checkout：

```bash
dsh plugin --profile web add .
```

如果你在插件目录外执行，传入插件目录路径：

```bash
dsh plugin --profile web add /path/to/dsh-lumen
```

没有全局 `dsh` 命令时，使用 DSH 源码仓库里的 CLI：

```bash
pnpm --dir /path/to/deepseek-harness dsh plugin --profile web add /path/to/dsh-lumen
```

或者在插件目录使用内置脚本：

```bash
DSH_ROOT=/path/to/deepseek-harness pnpm dev:install
```

构建插件：

```bash
pnpm build
```

开发时可以运行：

```bash
pnpm dev
```

`pnpm dev` 只做两件事：

- 启动 `scripts/watch.mjs`，持续从 `src/` 构建 `lib/`。
- 从 `DSH_ROOT` 指向的 DSH checkout 启动 `pnpm dsh web --patch debug/dsh-lumen.cordis.patch.yml`。

默认 `DSH_ROOT` 是 `../deepseek-harness`，可以覆盖：

```bash
DSH_ROOT=/path/to/deepseek-harness pnpm dev
```

`--patch` 是 DSH 官方 profile overlay 机制。这里的 patch 只插入插件 row；包解析应由 `dsh plugin --profile web add ...` 管理，而不是由插件脚本创建 symlink。

## 发布安装

Git 安装源码包时，DSH 文档要求插件作者提供 `prepare`，因为 pnpm 会拉取源码而非 `lib/`。本包的 `prepare` 会执行 `scripts/build.mjs`。

用户通过 git 安装时可能需要按 pnpm 提示在 profile 的 `pnpm-workspace.yaml` 中 allowlist build。安装 npm 包或 tarball 时不需要该 allowlist。

## 开发限制

- 当前 UI 是 composer dock 面板，不再支持页面划词浮层。
- `contextual` 使用最近 8 条 derived messages；后续可以改成 message-aware 的 slot action。
- Remote contribution 目前手写 strict descriptor；后续可以接入官方 Typert generator。
