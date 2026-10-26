# 实验组件调研与接入选择

2026-10-26。问题：上一版插件只显示实验运行元信息，没有提供参数探索、数值曲线或解剖视图。

## 选择

| 组件 / 模型 | 本次用途 | 选择依据 |
| --- | --- | --- |
| NiiVue 0.68.2 | 可旋转、缩放的标准脑表面及 MRI 多平面浏览 | 仓库原 Vue 实验区已使用同一引擎和本地资产；官方支持表面网格、NIfTI 和 React 嵌入。只移植引擎装配，控件继续使用清舟 UI。 |
| Apache ECharts 6.0.0 | 膜电位、离子电流、门控变量与历史运行对比 | 仓库已有该引擎；按需引入 SVG 图表和交互，样式跟随宿主语义 token。避免引入独立仪表盘 UI。 |
| 现有 LIF 模型 | 阈值与频率编码教学 | 直接展示现有服务端数值结果，不再只显示产物文件名。其电流采用教学尺度，波形不是生物动作电位的形状。 |
| Hodgkin–Huxley 模型 | 钠 / 钾通道及动作电位教学 | 新增固定步长 RK4 数值积分，与现有实验持久化、认证和状态接口共用流程；参数和单位明确，可复现及比较。 |

研究过 Plotly 与 uPlot。两者可以用于科学曲线，但本项目已有 ECharts，当前曲线规模无需增加另一套绘图依赖。NEURON 可用于更细致的多室及网络模型，本次不声称已接入 NEURON，也不以装饰性动画替代计算结果。

## 科学含义

HH 使用经典鱿鱼巨轴突单膜片模型（6.3°C），电压按静息约 -65mV 的约定；固定步长 0.025ms，耦合求解 V/m/h/n，钠、钾、漏电流随状态计算，动作电位不使用人为 reset。电流脉冲位于 10ms 至总时长减 10ms；频率分母采用完整运行时长。减少钠通道电导可以观察该模型的放电变化，但不是人体药物剂量实验。

解剖视图采用标准模板，并不反映单膜片模型的空间活动或患者影像。组件层不生成假激活、假电极或伪造测量数据。

## 已查证的官方来源

- [NiiVue：支持的影像格式与加载](https://niivue.com/docs/loading/)、[React 嵌入](https://niivue.com/docs/)、[BSD-2-Clause 许可证](https://github.com/niivue/niivue/blob/main/LICENSE)。
- [ECharts：Canvas / SVG 选择](https://apache.github.io/echarts-handbook/en/best-practices/canvas-vs-svg/)。
- [Hodgkin–Huxley 原模型的 CellML 表达](https://models.physiomeproject.org/workspace/hodgkin_huxley_1952/file/2135095d2e2cd9dd671afaea954e523dc0c4d451/hodgkin_huxley_1952.cellml)、[Brian 2 的 HH 示例](https://brian2.readthedocs.io/en/2.10.1/examples/IF_curve_Hodgkin_Huxley.html)。注意不同资料的电压参考点不同。
- [NEURON 的能力范围](https://www.neuron.yale.edu/neuron/static/about/what.html)。
- [Plotly 科学曲线](https://plotly.com/javascript/scientific-charts/)、[uPlot 项目主页](https://leeoniya.github.io/uPlot/)。

## 本地资产来源

预览复用仓库已有 `frontend/public/neurolab/niivue/` 的两个 `BrainMesh_ICBM152.*.mz3` 文件和 `mni152.nii.gz`，字节不变，放置于预览的同路径静态目录。没有实时依赖第三方远程 CDN。生产包不打包这些示例资产，宿主通过 props 提供 URL。

NiiVue 示例数据仓库说明 `mni152` 源自 ICBM 152 Nonlinear 2009 模板，见 [样例说明及各数据来源](https://github.com/niivue/niivue-demo-images#licenses) 和 [McGill 模板介绍](https://www.mcgill.ca/bic/software/tools-data-analysis/anatomical-mri/atlases/icbm152-non-linear-2009)。表面文件沿用已有仓库的 ICBM152 标识；当前源码中没有更细的导出版本记录，不补造来源或把引擎许可证等同为所有影像资产的许可证。本次仅本地预览，后续若分发资产，应保留其独立来源记录和上游条款。
