# 交互实验台验收

日期：2026-10-26。三个 Claude CLI 任务分别完成数值模型、工作台和脑影像组件，协调阶段完成预览装配、主题修正、真实 HTTP / 浏览器验证。仍未接入或修改清舟宿主。

## 可体验的内容

- **电生理**：HH 默认模型，以及原有 LIF 模型；刺激电流、时长、钠 / 钾电导参数、预设和显式运行。
- **科学曲线**：实际服务端计算的膜电位、离子电流、m/h/n 门控变量；缩放、提示与最多三次运行的电压叠加。结果保留运行时参数，编辑参数后显示尚未运行。
- **脑解剖**：实际 NiiVue WebGL2 双半球表面，可旋转、缩放、复位和调透明度；显式切换到 MRI 后加载 MNI152，并显示三个正交切面。该视图是独立标准解剖参考。
- **宿主风格**：沿用 Lobe / Ant Design、语义 token 和宿主语言；图表直接订阅宿主 token，亮暗主题变化会更新已绘制的 SVG。

入口从原来的组件清单调整为实验台。原验收页仍可通过顶部切换，或 `?view=validation` 访问。

## 证据

| 检查 | 结果 |
| --- | --- |
| 后端全量测试 | 305 项通过，包含新增 HH 的 33 项 |
| UI 全量测试 | 9 个文件、105 项通过；协调调整后相关 14 项再次通过 |
| UI TypeScript 构建 | 通过 |
| 预览生产构建 | 通过；ECharts 和 NiiVue 延迟分块加载，仍有开发预览 chunk 大小提示 |
| 数值模型 HTTP 检查 | 通过正式插件 API 运行与持久化、幂等重放、钠通道关闭、最长时长与 LIF 参数对比 |
| 新实验台 Chromium 验收 | 通过 HH 实际运行、三组 SVG、关闭钠通道后零放电、两次曲线比较、亮暗切换、390px 无横向溢出、真实 WebGL 旋转、按需 MRI |
| 原八项能力浏览器回归 | 通过，包括答题提交 / 进度 / 实验启动状态 |
| 已有源码保护 | 142 个 Vue 前端和核心协议源文件哈希未变 |

默认 HH（10 µA/cm²，120ms，Na/K 比例均为 1）产生 **7 次放电、4801 个采样点**；Na 比例改为 0 后 **0 次放电且钠电流全为 0**。最长 300ms 产生 12001 点，仍可通过核心 HTTP 传输的默认响应预算。LIF 在刺激 2 与 8 时分别产生 0 与 18 次阈值越过。

将 HH 步长减半至 0.0125ms 作收敛抽查，默认条件下放电次数相同，膜电位 RMSE 约 0.0666mV、最大点差约 0.641mV。模型为经典固定温度单膜片教学模型，未以人体数据标定。

真实浏览器确认：挂载、参数编辑、主题切换、脑解剖探索和刷新均未新增仿真写请求；两次显式运行只产生两次写入；MRI 在选择前不请求，选择后请求一次；没有控制台错误或页面异常。jsdom 中的 TextArea 自动高度及 canvas 未实现提示属于测试环境限制，实际 Chromium 无对应错误。

## 运行

依赖和构建顺序见 [UI 预览指南](QINGZHOU-UI-GUIDE.md)。仓库根目录：

```bash
npm run ui:actual
npm run ui:lab-http
npm run ui:lab-verify
```

如需指定已有浏览器：

```powershell
npm run ui:lab-verify -- --browser-executable "C:/Users/shiro/AppData/Local/ms-playwright/chromium-1234/chrome-win64/chrome.exe"
```

验收截图位于已忽略的 `examples/qingzhou-ui-preview/output/playwright/`：

- `laboratory-light.png` / `laboratory-dark.png` / `laboratory-narrow.png`
- `brain-surface.png` / `brain-mri.png`

引擎与科学依据见 [组件调研](LAB-COMPONENT-RESEARCH.md)，脑图 API 和来源记录见 [脑影像组件说明](NEUROIMAGING.md)。
