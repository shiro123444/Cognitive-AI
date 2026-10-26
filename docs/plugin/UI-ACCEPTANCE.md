# 清舟 UI 适配层验收记录

日期：2026-10-26。通过三个 Claude CLI 任务并行实现基础接口、组件和独立预览，协调阶段完成主题对齐、身份隔离、构建与真实浏览器验收。CLI 使用当前网关配置，未覆盖模型设置。

后续已增加交互实验台、HH 数值模型及 NiiVue 脑影像组件，最新结果见 [实验台验收](LAB-ACCEPTANCE.md)；下表保留初版 UI 验收基线。

## 本轮交付

- `packages/edufish-qingzhou-ui/`：私有 ESM 包 `@edufish/qingzhou-ui@0.1.0`，包含课程、资料、图谱、测验、提交反馈、学习进度及实验结果组件，另有显式答题表单和实验启动组件。
- 导出八项操作的 Render / Inspector / Streaming 映射、业务依赖 Provider、受信任身份上下文及中英文资源。结果快照严格按核心包 schema 校验；挂载和历史重放不调用写操作。
- 生产适配层沿用宿主组件和 `createStaticStyles` / `cssVar.*`，通过 peers 使用宿主依赖，没有自建主题 Provider、全局 reset、配色或应用外壳。
- `examples/qingzhou-ui-preview/`：开发预览，按清舟 `AppTheme` 组合真实 Lobe ThemeProvider / ConfigProvider。主色通过宿主已有的 `customTheme.primaryColor` 调整；只有预览装配主题和语言环境。

## 验证结果

| 检查 | 结果 |
| --- | --- |
| 适配包 TypeScript 构建 | 通过，输出 ESM、声明及 source maps |
| 适配包测试 | 4 个文件、60 项通过；使用真实 UI 库，无组件库 mock |
| 预览生产构建 | 通过；开发预览完整引入组件库，约 1.20 MB JS，存在 chunk 大小提示 |
| 八项确定性样例 | 全部通过核心包输出 schema |
| 真实 Chromium 浏览器 | 通过，覆盖下述界面与 HTTP 链路 |
| npm 打包文件检查 | 通过，59 个文件，约 50.4 KiB，无 bundled dependencies |
| 已有代码保护 | 本轮前记录的 254 个 Vue 前端、Python 后端和插件核心源文件 SHA-256 均未变化 |

浏览器验收覆盖：八项结果快照、可访问 SVG 图谱、亮暗主题及主色的实际计算样式变化、中英文切换、390px 窄屏无横向溢出、键盘输入与 Enter 提交、StrictMode 挂载及刷新无写请求、无控制台错误或页面异常。

真实调用使用现有临时数据库后端并挂载正式插件 API，浏览器通过 Vite 的本机代理调用：课程 → 资料检索 → 图谱 → 测验 → 显式提交 → 进度包含该提交 → 显式启动实验 → 查询同一运行状态。合计恰好两次写请求；令牌仅驻留内存，无 Cookie 或浏览器持久化。

交互回归还覆盖重复点击保护、失败重试保持请求 ID、替换 client / invocation factory 后抑制旧响应且保留同一写入的重试 ID，以及身份切换后清空私有答题草稿和反馈。宿主应使用稳定的 client / `getInvocation`，并以用户和会话构造 `identityKey`。

jsdom 中 Ant Design 自动高度 TextArea 有一条 NaN 高度提示；真实 Chromium 无该错误，浏览器验收通过。

## 复现与截图

从仓库根目录运行（首次依赖安装及构建顺序见 [预览指南](QINGZHOU-UI-GUIDE.md)）：

```bash
npm run ui:build
npm run ui:test
npm run ui:preview
# 或启动带临时数据库后端的预览：
npm run ui:actual
# 已安装 Playwright Chromium 时：
npm run ui:verify
```

本机验收使用已有 Chromium，未额外下载浏览器：

```powershell
npm run ui:verify -- --browser-executable "C:/Users/shiro/AppData/Local/ms-playwright/chromium-1234/chrome-win64/chrome.exe"
```

截图在已忽略的 `examples/qingzhou-ui-preview/output/playwright/`：`light.png`、`dark.png`、`narrow.png`、`actual.png`。验收结束后临时服务器已关闭。

## 边界

本轮未修改、注册或合并 Qingzhou，未发布包或推送提交。清舟仍使用内部静态注册表，没有经本次验证可用的公共动态 UI SDK；导出的映射只是后续宿主接入点。当前验证证明独立适配层继承同一组件库和主题接口，尚不能代替嵌入实际清舟上下文后的验收。生产认证接入、宿主服务和私有共享工具组件的组合留待后续接入阶段。
