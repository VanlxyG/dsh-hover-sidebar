# dsh-hover-sidebar

**DeepSeek Harness 左栏悬停展开，移开收起。** 手动打开的侧栏保持展开。

[English](README.en.md) · [发行版本](https://github.com/VanlxyG/dsh-hover-sidebar/releases) · [反馈问题](https://github.com/VanlxyG/dsh-hover-sidebar/issues)

零运行时依赖，无需构建，无安装脚本。插件通过 Harness 的 `layout.toggleSidebar()` 操作左栏；不修改宿主文件，不读取会话或凭据，不发送网络请求。

## 安装与开关

在官方桌面版 **设置 → 插件** 的添加插件入口，填入发行包地址：

```text
https://github.com/VanlxyG/dsh-hover-sidebar/releases/download/v0.2.0/dsh-hover-sidebar-0.2.0.tgz
```

也可以下载发行页中的 `.tgz`，在添加插件处选择本地包。安装后按宿主提示刷新页面或重启。

安装完成后，在 **设置 → 插件** 找到“侧边栏悬停展开”，使用旁边的开关启停。宿主会保存选择，并管理卸载。支持热卸载的宿主会即时清理监听、计时器和动画；宿主要求刷新时，刷新后完成启停。

Web 版可用 CLI：

```sh
dsh plugin --profile web add https://github.com/VanlxyG/dsh-hover-sidebar/releases/download/v0.2.0/dsh-hover-sidebar-0.2.0.tgz
```

桌面 profile 请使用桌面端自己的插件管理入口。**不要仅手工复制到 `node_modules`**：正式安装需要同时记录依赖、来源和 bundle；否则宿主重装依赖后可能丢包。

从旧手工版本迁移时，应先备份并删除用户 `cordis.patch.yml` 中旧的 `- insert: ... id: hover-sidebar / name: dsh-hover-sidebar` 登记块，再通过管理器安装，避免重复实例。保留其他插件和配置。

## 使用

| 操作 | 结果 |
| --- | --- |
| 收起后，在窗口左边缘停留 120ms | 自动展开。桌面默认热区 12px；Web 版整个收起图标栏都有效 |
| 鼠标离开侧栏右边缘及 24px 缓冲区 | 300ms 后收起；返回侧栏取消收起 |
| 手动点击原生开关或使用宿主快捷键打开 | 固定展开，不自动关闭 |
| 手动收起时鼠标仍停在左缘 | 移出热区再回来才重新展开 |
| 在临时展开的侧栏里输入、使用键盘导航或菜单 | 保持展开，交互结束后重新判断 |
| 拖拽、调整栏宽、按住鼠标按钮 | 暂停自动触发 |
| 按 Escape | 收起临时展开的侧栏 |

仅处理鼠标和悬停笔事件，不用触摸手势触发。动画遵循系统“减少动态效果”设置。

## 兼容性

当前适配基线：官方 DSH `0.2.1-rc.2` 的布局契约。桌面收起宽度 0、Web 图标栏宽度 56 的交互与动画有独立浏览器验收。

宿主处于快速迭代阶段，[官方明确提示可能出现破坏性变更](https://github.com/deepseek-ai/deepseek-harness)。任何插件都无法保证永远不受更新影响。这里用以下措施减少维护成本：

- 无宿主内部模块导入、无锁定版本的 DSH peer 依赖、无 React 或打包器依赖。
- 只调用布局服务公开动作；DOM 适配集中在一个函数中，接受变化的 CSS 模块哈希。
- 侧栏 DOM 被热替换后自动重新绑定；无法识别布局或缺少能力时停止增强，不猜测其他按钮。
- 幂等卸载与单实例替换，禁用后不继续拦截事件或改变动画。
- 提交自动运行逻辑测试、打包检查和真实 Chromium 回归。

兼容宿主更新不等于阻止宿主删除或重置整个 profile。正式安装能让依赖管理器知道此包存在；整份 profile 被覆盖仍需从备份或发行包恢复。

## 调参

默认值适合直接使用。高级参数可在页面开发者工具设置；保存在当前浏览器源的本地存储，立即生效：

```js
__dshHoverSidebar.configure({ hotzonePx: 16, leaveDelayMs: 450 })
__dshHoverSidebar.setEnabled(false) // 当前浏览器的功能开关
__dshHoverSidebar.setEnabled(true)
__dshHoverSidebar.configure({}) // 恢复默认
__dshHoverSidebar.state()       // 诊断，不含会话或凭据信息
__dshHoverSidebar.stop()        // 卸载本次实例，下次刷新恢复
```

浏览器功能开关与宿主的包启用状态分别保存。需要跨重启、跨页面稳定停用时，使用宿主插件管理开关。随机端口的桌面源可能使浏览器参数在重启后回到默认。

| 参数 | 默认 | 允许范围 |
| --- | ---: | --- |
| `hotzonePx` | 12 | 1–48px |
| `keepOpenMarginPx` | 24 | 0–80px |
| `openDelayMs` | 120 | 0–2000ms |
| `leaveDelayMs` | 300 | 0–5000ms |
| `animMs` / `closeAnimMs` | 260 / 200 | 0–1200ms |
| `railMaxPx` | 100 | 48–160px，用于识别收起图标栏 |
| `smooth` / `enabled` | true | 布尔值 |
| `easing` / `closeEasing` | 见源码 | 标准 easing 名称或合法 cubic-bezier |

## 开发与发布

Node.js 22 或更新版本，使用内置测试运行器。无需 `npm install`。

```sh
npm test
npm run check
npm run test:browser
npm run pack:release
```

浏览器测试自动启动隔离的无界面 Chrome / Edge，使用随机回环端口和临时用户目录；不接入日常浏览器，不读取 DSH 凭据。无法自动找到浏览器时，设置 `BROWSER_BIN` 为其可执行文件路径。测试产物在被忽略的 `artifacts/`，发行包及校验和在 `dist/`。

`main` 的 CI 全部通过后自动为新的 `package.json` 版本创建 GitHub Release，附 `.tgz` 和 `SHA256SUMS`；已存在的发行版本不覆盖。发布新版本时同步更新 `package.json`、`client.js` 中的版本号和安装示例，再维护 [CHANGELOG.md](CHANGELOG.md)。

## 市场与安全

标准 bundle 可以由宿主管理。要在 dsh-market 的公开“发现”列表中搜到，还需要向 [awesome-dsh-plugin 社区目录](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin)提交收录申请；[市场官方说明](https://github.com/dsh-market/dsh-market#submit-your-plugin)明确由该目录维护列表。建仓或安装成功本身不表示已经收录。

见 [SECURITY.md](SECURITY.md) 的边界与漏洞报告方式，见 [CONTRIBUTING.md](CONTRIBUTING.md) 的维护约定。MIT 许可证。
