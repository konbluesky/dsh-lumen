# DSH Lumen

DSH Lumen 是「知识透镜 / Knowledge Lens」插件的本地开发骨架。

名字含义：**Lumen** 是光通量单位，也有“照亮”的意味。这个插件的目标就是在 DSH 对话中照亮用户临时不理解的概念、术语和知识盲点。

## 目标

在 DSH Web GUI 聊天区中选中文本后，显示一个轻量浮动按钮，点击后打开迷你知识面板。当前骨架先实现最小可见调试链路：

- client plugin 可被 DSH Web 加载；
- 浏览器端 `apply(ctx)` 可执行；
- 可监听页面选区；
- 可显示浮动按钮和 popover；
- 可验证插件 bundle / overlay / Web GUI 链路是否打通。

后续再接入真正的上下文解释、one-shot LLM、subagent、搜索和知识卡片能力。

## 目录

```text
dsh-lumen/
  package.json
  tsconfig.json
  src/index.ts
  src/client/index.tsx
  src/client/Panel.tsx
  lib/
  debug/dsh-lumen.cordis.patch.yml
  scripts/build.mjs
  scripts/watch.mjs
  scripts/dev-web.mjs
  scripts/dev-link.mjs
  scripts/dev-unlink.mjs
  README.md
```

## DSH 插件机制对照

DSH Web client plugin 是一个双半侧包：

- Host 半侧：`src/index.ts`，构建到 `lib/index.js`，由 Cordis Loader 在 Node 侧加载；当前是空 `apply()`，只用于让插件作为普通 Cordis row 出现在配置树里。
- Browser 半侧：`src/client/index.tsx`，构建到 `lib/client.js`，由 DSH client module system 通过 `exports["./client"]` 提供给浏览器。
- Manifest：`package.json#dsh.client` 声明这是 web client plugin；`platform: "web"` 表示进入 Web 插件表，`inject` 是包级依赖边，主要用于发现、预检和 HMR 信息，不等同于 Cordis 服务启动顺序。
- Overlay：`debug/dsh-lumen.cordis.patch.yml` 把 `@local/dsh-lumen` 插入 Web profile 的 Cordis 配置树。只要这个 row 被挂载，DSH 就会扫描它的 `dsh.client` 并服务 `lib/client.js`。

`lib/` 不是第三方库目录，而是构建产物目录：

- `lib/index.js`：Host 半侧运行时代码。
- `lib/client.js`：Browser 半侧 bundle，必须是 `window.__ModuleLoader__.load({ id, factory })` 这种 lazy-CJS factory 产物。
- `lib/types/**`：TypeScript 编译出的 JS 中间产物和 `.d.ts` 类型声明。

不要手写 `lib/`。日常开发只改 `src/`，然后运行 `pnpm build` 或 `pnpm watch` 生成 `lib/`。

DSH 官方仓库内的 client plugin 使用 `packages/client/tsdown.client.ts` 的 `clientBundle()` preset 生成 lazy-CJS bundle。这个 preset 目前没有作为 npm 包发布，所以 `dsh-lumen` 作为仓库外插件，在 `scripts/build.mjs` 里复刻了最小构建流程：先 `tsc` 输出 `lib/types`，再用 `tsdown` 打包 host/browser 入口，最后把 browser bundle 包装成 DSH client module system 需要的格式。

## 基本调试链路

### 推荐：一条命令启动开发服务

在 `dsh-lumen` 目录中运行：

```bash
pnpm dev
```

这个命令会先建立本地包链接，然后从 `DSH_ROOT` 指向的 DSH checkout 启动。默认会尝试使用 `../deepseek-harness`：

```bash
DSH_ROOT=/path/to/deepseek-harness pnpm dev
```

DSH Web bundle 里已经挂载了 `@deepseek-ai/dsh-client-hmr`。它会轮询已注册 client plugin 的 `lib/client.js`，文件内容变化后会通过 `/plugins/events` 通知浏览器端热替换对应 Cordis client fiber。因此当前手写 bundle 的开发流程是：

1. 保持 `pnpm dev` 运行；
2. 修改 `src/` 下的 TS/TSX 源码；
3. `scripts/watch.mjs` 会重建 `lib/client.js`；
4. DSH `client-hmr` 会发现 bundle 变化并自动热替换插件；如果页面状态异常，手动刷新一次即可。

需要重启 `pnpm dev` 的情况：

- 修改 `package.json` 里的 `exports` 或 `dsh.client`；
- 修改 `debug/dsh-lumen.cordis.patch.yml` 里的插件行；
- 新增或移除插件包，而不是只改现有 `src/`；
- host 侧 `lib/index.js` 从空实现变成有状态逻辑，并且需要重新挂载 host row。

### 1. 建立本地包链接

```bash
node dsh-lumen/scripts/dev-link.mjs
```

脚本会创建两个符号链接：

- `node_modules/@local/dsh-lumen` under DSH checkout，方便在源码目录中手动验证包解析；
- `~/.dsh/profiles/web/node_modules/@local/dsh-lumen`，这是 `dsh web --patch` 实际解析 overlay 插件名时需要的链接，因为当前 Web profile 的 `ctx.baseUrl` 是 `~/.dsh/profiles/web/`。

默认 DSH checkout 路径：

```text
../deepseek-harness
```

如需覆盖：

```bash
DSH_ROOT=/path/to/deepseek-harness \
DSH_PROFILE_ROOT=/path/to/.dsh/profiles/web \
node dsh-lumen/scripts/dev-link.mjs
```

### 2. 使用 overlay 启动 DSH Web

在 DSH checkout 中运行：

```bash
cd /path/to/deepseek-harness
pnpm dsh web --patch /path/to/dsh-lumen/debug/dsh-lumen.cordis.patch.yml
```

如果你的本地命令不是 `pnpm dsh web`，也可以使用项目当前习惯的 `dsh web` 启动方式，只要带上同一个 `--patch` 文件。

### 3. 打开当前 DSH Web GUI

访问：

```text
http://127.0.0.1:3080
```

进入聊天页面后，选中任意聊天文本，应看到一个 `Lumen` 浮动按钮。点击后会打开 DSH Lumen 调试面板。

### 4. 修改插件

当前骨架的浏览器源码在：

```text
dsh-lumen/src/client/
```

修改后 `pnpm dev` 启动的 watcher 会重写 `lib/client.js`。DSH 的 `client-hmr` 会自动发现 bundle 文件变化并热替换浏览器插件；如果页面状态异常，刷新页面即可验证。

### 5. 移除本地包链接

```bash
node dsh-lumen/scripts/dev-unlink.mjs
```

## GitHub 建议

如果后续发布成独立仓库，可以使用：

- 仓库名：`dsh-lumen`
- topics：`dsh-plugin`, `deepseek-harness`, `cordis`, `ai-assistant`, `knowledge-management`

## 当前限制

- 当前版本只是调试骨架，不会调用模型；
- 暂未读取结构化 session/message 上下文；
- 暂未接入 DSH slots / conversation service；
- 暂未保存知识卡片；
- 暂未接入 subagent 或搜索工具。

## 下一步建议

1. 把 DOM 选区限定到聊天消息区域，避免在设置页、侧栏或输入框中误触发；
2. 从选区 DOM 向上定位所属 message，拿到 messageId、role、content 等元信息；
3. 读取当前 session 最近若干轮上下文，用于“结合当前会话解释”；
4. 接入 one-shot explanation API，把用户编辑后的选区草稿和上下文发给模型；
5. 在 panel 中展示 loading、错误、解释结果和重新生成状态；
6. 支持把解释结果插入主输入框；
7. 再引入一次追问、展开 drawer、搜索、subagent 和知识卡片。

## MVP 进度

已完成：

- client plugin 可被 DSH Web 加载；
- 监听页面文本选区；
- 显示浮动按钮；
- 点击后打开知识面板；
- 面板中可二次编辑选区内容；
- 支持复制编辑后的内容；
- 支持关闭面板。

待完成：

- 判断选区是否位于聊天消息区域；
- 获取所属消息和最近会话上下文；
- 默认执行“结合当前会话解释”；
- 展示模型回答；
- 支持插入主输入框。
