import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';

import type { EduFishUIResourceBundle } from '../i18n.js';

/**
 * New `edufish` namespace keys owned by the lab workbench.
 *
 * The adapter never initialises i18next. The coordinator may merge these
 * resources into the host bundle; the exported defaults keep the workbench
 * readable (English or Chinese) when a key has not been merged yet.
 */

const enUS = {
  labWbTitle: 'Neuron workbench',
  labWbDescription:
    'Run a real deterministic Hodgkin–Huxley axon patch or the teaching LIF model, then compare completed runs and inspect voltage, ionic currents and gating.',
  labWbModel: 'Model',
  labWbModelHH: 'Hodgkin–Huxley',
  labWbModelLIF: 'Leaky integrate-and-fire',
  labWbModelHHShort: 'HH',
  labWbModelLIFShort: 'LIF',
  labWbParameters: 'Parameters',
  labWbCurrentInputs: 'Current inputs',
  labWbEditedNotRun: 'Edited — not yet run',
  labWbPresets: 'Presets',
  labWbPresetBaseline: 'Baseline',
  labWbPresetSubthreshold: 'Subthreshold',
  labWbPresetSodiumBlock: 'Sodium channel block',
  labWbPresetStrongDrive: 'Strong drive',
  labWbStimulusCurrent: 'Stimulus current',
  labWbDuration: 'Duration',
  labWbGNaScale: 'Na⁺ conductance scale',
  labWbGKScale: 'K⁺ conductance scale',
  labWbUnitMicroAmp: 'µA/cm²',
  labWbUnitArbitrary: 'a.u.',
  labWbUnitMs: 'ms',
  labWbUnitScale: '×',
  labWbRun: 'Run simulation',
  labWbRunning: 'Running…',
  labWbRetry: 'Retry simulation',
  labWbStopWaiting: 'Stop waiting',
  labWbCancelNotice:
    'Stop waiting only cancels this view’s wait. It does not cancel work already running on the server.',
  labWbCancelled: 'Stopped waiting locally. The run may still be running.',
  labWbStartError:
    'The simulation could not be started. Please retry explicitly.',
  labWbParameterRequired: 'Check the highlighted parameter values.',
  labWbStatusError:
    'The run status could not be checked. The run may still be running.',
  labWbStatusRetry: 'Check status again',
  labWbStatusPending: 'Waiting for the run to finish…',
  labWbPollTimeout:
    'Stopped checking status after a bounded wait. The run may still be running.',
  labWbRunFailed: 'The run failed. No result was saved.',
  labWbUnreadable:
    'A completed run did not contain a readable neuron trace. Its unknown payload is not displayed.',
  labWbCompletedRuns: 'Completed runs',
  labWbNoCompletedRuns:
    'No completed runs yet. Run the simulation to see real results.',
  labWbRunLabel: 'Run {{index}}',
  labWbRunColumn: 'Run',
  labWbComparisonNote:
    'The voltage chart overlays up to three completed runs. Parameters shown with each run belong to that completed run, not to the current inputs.',
  labWbClearRuns: 'Clear comparison',
  labWbInspectRun: 'Inspect completed run',
  labWbVoltageTitle: 'Membrane potential',
  labWbVoltageUnit: 'mV',
  labWbTimeUnit: 'ms',
  labWbCurrentsTitle: 'Ionic currents',
  labWbGatingTitle: 'Gating variables',
  labWbCurrentUnit: 'µA/cm²',
  labWbGatingUnit: 'fraction',
  labWbSpikeTimes: 'Spike times',
  labWbEvents: 'Run events',
  labWbSpikeMarkers: 'Spike markers',
  labWbNoSpikes: 'No threshold crossings in this run.',
  labWbSpikeMore: '{{count}} more spike times not shown.',
  labWbMetrics: 'Metrics',
  labWbTotalSpikes: 'Spikes',
  labWbFiringRate: 'Firing rate',
  labWbFiringRateUnit: 'Hz',
  labWbThreshold: 'Threshold',
  labWbMaxPotential: 'Maximum potential',
  labWbMeanPotential: 'Mean potential',
  labWbDt: 'Time step',
  labWbSampleCount: 'Samples',
  labWbModelLabel: 'Model',
  labWbRunId: 'Run ID',
  labWbCompletedAt: 'Completed',
  labWbStatus: 'Status',
  labWbRunParameters: 'Parameters recorded for this run',
  labWbVoltageChartA11y:
    'Membrane potential over time for {{count}} completed runs, in millivolts.',
  labWbCurrentChartA11y:
    'Sodium, potassium, leak and stimulus currents over time for the inspected run, in microamperes per square centimetre.',
  labWbGateChartA11y:
    'Sodium activation m, sodium inactivation h and potassium activation n over time for the inspected run.',
  labWbChartLoading: 'Loading chart…',
  labWbModelNoteHH:
    'Single isopotential squid-axon membrane patch at 6.3 °C. Classic Hodgkin–Huxley equations with a −65 mV resting convention. Not a NEURON simulation, clinical result or human measurement.',
  labWbModelNoteLIF:
    'Teaching leaky integrate-and-fire model. Stimulus current is in arbitrary teaching units, not microamperes; threshold crossings are not biophysical action-potential shapes.',
  labWbMetadata: 'Model metadata',
  labWbMetadataMethod: 'Method',
  labWbMetadataSolver: 'Solver',
  labWbMetadataTemperature: 'Temperature',
  labWbMetadataConstants: 'Constants',
  labWbMetadataUnits: 'Units',
  labWbSodiumCurrent: 'Na⁺ current (I_Na)',
  labWbPotassiumCurrent: 'K⁺ current (I_K)',
  labWbLeakCurrent: 'Leak current (I_leak)',
  labWbStimulusCurrentTrace: 'Stimulus current (I_stim)',
  labWbGateM: 'm — Na⁺ activation',
  labWbGateH: 'h — Na⁺ inactivation',
  labWbGateN: 'n — K⁺ activation',
  labWbThresholdLine: 'threshold',
} as const;

const zhCN = {
  labWbTitle: '神经元工作台',
  labWbDescription:
    '运行真实的确定性 Hodgkin–Huxley 轴突膜片或教学用 LIF 模型，比较已完成的运行，并查看膜电位、离子电流与门控变量。',
  labWbModel: '模型',
  labWbModelHH: 'Hodgkin–Huxley',
  labWbModelLIF: '漏电积分放电（LIF）',
  labWbModelHHShort: 'HH',
  labWbModelLIFShort: 'LIF',
  labWbParameters: '参数',
  labWbCurrentInputs: '当前输入',
  labWbEditedNotRun: '已修改，尚未运行',
  labWbPresets: '预设',
  labWbPresetBaseline: '基线',
  labWbPresetSubthreshold: '阈下刺激',
  labWbPresetSodiumBlock: '钠通道阻断',
  labWbPresetStrongDrive: '强刺激',
  labWbStimulusCurrent: '刺激电流',
  labWbDuration: '持续时间',
  labWbGNaScale: 'Na⁺ 电导缩放',
  labWbGKScale: 'K⁺ 电导缩放',
  labWbUnitMicroAmp: 'µA/cm²',
  labWbUnitArbitrary: '教学单位',
  labWbUnitMs: 'ms',
  labWbUnitScale: '×',
  labWbRun: '运行仿真',
  labWbRunning: '运行中…',
  labWbRetry: '重试仿真',
  labWbStopWaiting: '停止等待',
  labWbCancelNotice:
    '停止等待只取消此视图中的等待，不会取消服务端已经开始的运行。',
  labWbCancelled: '已在本地停止等待。运行可能仍在继续。',
  labWbStartError: '无法启动仿真，请明确重试。',
  labWbParameterRequired: '请检查标出的参数值。',
  labWbStatusError: '无法检查运行状态。运行可能仍在继续。',
  labWbStatusRetry: '再次检查状态',
  labWbStatusPending: '正在等待运行完成…',
  labWbPollTimeout: '有界等待结束后已停止检查状态。运行可能仍在继续。',
  labWbRunFailed: '运行失败，未保存结果。',
  labWbUnreadable:
    '某次已完成的运行不包含可读取的神经元轨迹，其未知载荷不会被显示。',
  labWbCompletedRuns: '已完成的运行',
  labWbNoCompletedRuns: '尚无已完成的运行。运行仿真后可查看真实结果。',
  labWbRunLabel: '第 {{index}} 次运行',
  labWbRunColumn: '运行',
  labWbComparisonNote:
    '电压图最多叠加三次已完成的运行。每次运行旁显示的参数属于该次运行，而不是当前输入。',
  labWbClearRuns: '清除比较',
  labWbInspectRun: '查看已完成的运行',
  labWbVoltageTitle: '膜电位',
  labWbVoltageUnit: 'mV',
  labWbTimeUnit: 'ms',
  labWbCurrentsTitle: '离子电流',
  labWbGatingTitle: '门控变量',
  labWbCurrentUnit: 'µA/cm²',
  labWbGatingUnit: '比例',
  labWbSpikeTimes: '放电时刻',
  labWbEvents: '运行事件',
  labWbSpikeMarkers: '放电标记',
  labWbNoSpikes: '此次运行没有跨阈事件。',
  labWbSpikeMore: '另有 {{count}} 个放电时刻未显示。',
  labWbMetrics: '指标',
  labWbTotalSpikes: '放电次数',
  labWbFiringRate: '放电频率',
  labWbFiringRateUnit: 'Hz',
  labWbThreshold: '阈值',
  labWbMaxPotential: '最高电位',
  labWbMeanPotential: '平均电位',
  labWbDt: '时间步长',
  labWbSampleCount: '采样点数',
  labWbModelLabel: '模型',
  labWbRunId: '运行编号',
  labWbCompletedAt: '完成时间',
  labWbStatus: '状态',
  labWbRunParameters: '此次运行记录的参数',
  labWbVoltageChartA11y: '{{count}} 次已完成运行的膜电位随时间变化，单位 mV。',
  labWbCurrentChartA11y:
    '所查看运行的钠、钾、漏电与刺激电流随时间变化，单位 µA/cm²。',
  labWbGateChartA11y:
    '所查看运行的钠激活 m、钠失活 h 与钾激活 n 随时间变化。',
  labWbChartLoading: '正在加载图表…',
  labWbModelNoteHH:
    '6.3 °C 下的单一等电位乌贼轴突膜片，采用经典 Hodgkin–Huxley 方程与 −65 mV 静息约定。不是 NEURON 仿真、临床结论或人体测量数据。',
  labWbModelNoteLIF:
    '教学用漏电积分放电模型。刺激电流使用任意教学单位，而不是微安；跨阈事件不是生物物理意义上的动作电位形态。',
  labWbMetadata: '模型元数据',
  labWbMetadataMethod: '方法',
  labWbMetadataSolver: '求解器',
  labWbMetadataTemperature: '温度',
  labWbMetadataConstants: '常数',
  labWbMetadataUnits: '单位',
  labWbSodiumCurrent: 'Na⁺ 电流（I_Na）',
  labWbPotassiumCurrent: 'K⁺ 电流（I_K）',
  labWbLeakCurrent: '漏电电流（I_leak）',
  labWbStimulusCurrentTrace: '刺激电流（I_stim）',
  labWbGateM: 'm — Na⁺ 激活',
  labWbGateH: 'h — Na⁺ 失活',
  labWbGateN: 'n — K⁺ 激活',
  labWbThresholdLine: '阈值',
};

export type LabStringKey = keyof typeof enUS;

const LAB_DEFAULTS: Record<
  'en-US' | 'zh-CN',
  Record<LabStringKey, string>
> = {
  'en-US': enUS,
  'zh-CN': zhCN,
};

export const edufishLabResources = {
  'en-US': { edufish: enUS },
  'zh-CN': { edufish: zhCN },
} as const satisfies Record<'en-US' | 'zh-CN', EduFishUIResourceBundle>;

export type LabTranslate = (
  key: LabStringKey,
  options?: Record<string, string | number>,
) => string;

export function useLabTranslation(): LabTranslate {
  const { t, i18n } = useTranslation('edufish');
  const translate = t as unknown as (
    key: string,
    options?: Record<string, unknown>,
  ) => string;
  const language = (i18n.resolvedLanguage ?? i18n.language ?? 'en-US')
    .toLowerCase()
    .startsWith('zh')
    ? 'zh-CN'
    : 'en-US';

  return useCallback(
    (key: LabStringKey, options?: Record<string, string | number>) =>
      translate(key, {
        defaultValue: LAB_DEFAULTS[language][key],
        ...options,
      }),
    [language, translate],
  );
}
