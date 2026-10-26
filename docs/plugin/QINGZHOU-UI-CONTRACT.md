# EduFish 的 Qingzhou UI 约定

更新日期：2026-10-26。用户已明确要求：插件界面使用 Qingzhou 的整体 UI、主题和交互规范。当前阶段仍不接入或修改 Qingzhou。

## 已核实的宿主能力

依据 GitHub `main=f05be3d8c`；本地 Qingzhou 主目录较旧，核对时读取了同一提交的 Git 对象。

| 能力 | 当前接口 / 位置 | 实际边界 |
| --- | --- | --- |
| 原子能力 | `AtomicPlugin`、`AtomicOperation`、`AtomicInvocation`、`AtomicRuntime` | 服务端工具、调用上下文、生命周期与版本锁；不自动提供界面 |
| 工具结果 | `BuiltinRenderProps`、`BuiltinRender` | React 工具结果渲染，包含 args、content、pluginState、messageId、toolCallId |
| 工具标题 / 状态 | `BuiltinInspectorProps` | 自定义工具调用标题、参数摘要、加载状态 |
| 流式展示与交互 | `BuiltinStreamingProps`、`BuiltinInterventionProps` | 流式进度、审批或自定义用户交互；应沿用宿主流程 |
| 侧边内容 | `BuiltinPortalProps`、`BuiltinToolsPortals` | 已有内部侧栏映射，尚非通用动态面板 SDK |
| 共享工具 UI | `@lobechat/shared-tool-ui` | 包含 ToolResultCard、文件显示、共享 Render / Inspector；当前为私有 workspace 包 |
| 全局主题 | `src/layout/GlobalProvider/AppTheme.tsx` | 宿主 ThemeProvider / ConfigProvider，管理外观、主色、中性色、字体及动效 |
| 品牌组件 | `src/features/QingzhouBrand/index.tsx` | 品牌标识、场景与装饰组件；内部功能组件，非独立发布的设计系统 |

`packages/builtin-tools/src/renders.ts` 以 identifier + apiName 查找组件，目前是构建时静态注册表。提供了内部扩展模式，但尚未发现稳定对外发布的 `@qingzhou/plugin-sdk` / `@qingzhou/ui-sdk`，也没有发现统一的运行时 registerPanel / registerRenderer 公共接口。

`ToolManifest.ui` 类型声明存在 iframe / module 选项。该字段不能证明通用动态模块加载、主题桥接或宿主 UI 继承已经实现。

## UI 规范

Qingzhou 的 `AGENTS.md` 明确采用 React 19 / TypeScript、`@lobehub/ui`、antd、antd-style，优先使用 `createStaticStyles` 和 `cssVar.*`。主线 package.json 固定的主要版本为 `@lobehub/ui@5.14.0`、`antd@6.3.5`、`antd-style@4.1.0`。

EduFish 的后续 UI 应遵守：

1. 在宿主现有 ThemeProvider / ConfigProvider 下渲染，继承主题、字体、语言、动效设置和基础组件行为。
2. 按钮、输入、表单、卡片、空状态、提示和弹窗优先复用宿主组件；图标使用宿主现有 lucide-react。
3. 样式使用语义变量，例如 colorText、colorTextSecondary、colorBgContainer、colorBorderSecondary、colorPrimary、borderRadiusLG。字号、间距与布局采用宿主组件默认值和邻近功能模式。
4. UI 依赖通过 peerDependencies 与宿主保持一致，避免打入第二份 React、主题提供者或组件库实例。
5. 文案使用 react-i18next 与宿主 locale 命名空间；页面交互遵循已有加载、错误、焦点和禁用行为。
6. 工具结果组件默认呈现历史快照。测验提交等写操作必须由明确用户操作触发，不能因组件挂载或历史消息重放而执行。
7. 图谱和脑影像保留 D3 / NiiVue 等领域渲染引擎；外层工具栏、卡片、面板和提示使用宿主组件，画布颜色由宿主主题映射注入。

这些规则以宿主现有实现为准；仓库尚未提供集中且完整的插件布局、组件尺寸和所有交互状态规范，不能声称已经存在一套完整公开的 Qingzhou 插件设计系统。

## 本项目的分层决定

- `@edufish/plugin`：继续保持无 UI 的能力与协议层，不依赖 React、Vue 或 Qingzhou。
- `@edufish/qingzhou-ui`：已单独实现 React 结果组件、测验交互和实验启动组件，复用宿主组件、语义主题变量及内部渲染约定。已导出八项操作的 Render / Inspector / Streaming 映射；尚未注册到宿主。验收入口见 [预览指南](QINGZHOU-UI-GUIDE.md)。
- 当前 Vue 前台：仍是原有独立应用，不作为 Qingzhou 插件 UI 的默认交付形式。
- 宿主 SDK 若需抽取：优先整理已有 Render / Inspector / Streaming / Intervention / Portal 类型、主题入口及宿主服务边界；这属于后续提议，不是现成接口。

## 源码依据

- [开发约定](https://github.com/shiro123444/Qingzhou/blob/f05be3d8ca5e5fa9567373be5d90469774ee6490/AGENTS.md)
- [工具 UI 类型](https://github.com/shiro123444/Qingzhou/blob/f05be3d8ca5e5fa9567373be5d90469774ee6490/packages/types/src/tool/builtin.ts)
- [渲染注册表](https://github.com/shiro123444/Qingzhou/blob/f05be3d8ca5e5fa9567373be5d90469774ee6490/packages/builtin-tools/src/renders.ts)
- [共享工具组件](https://github.com/shiro123444/Qingzhou/blob/f05be3d8ca5e5fa9567373be5d90469774ee6490/packages/shared-tool-ui/package.json)
- [宿主主题](https://github.com/shiro123444/Qingzhou/blob/f05be3d8ca5e5fa9567373be5d90469774ee6490/src/layout/GlobalProvider/AppTheme.tsx)
- [静态样式指南](https://github.com/shiro123444/Qingzhou/blob/f05be3d8ca5e5fa9567373be5d90469774ee6490/.cursor/docs/createStaticStyles_migration_guide.md)
