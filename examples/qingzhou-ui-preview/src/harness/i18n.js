import i18next from 'i18next';
import { initReactI18next } from 'react-i18next';
import { edufishUIResources, edufishLabResources, BRAIN_EN_DEFAULTS, BRAIN_ZH_DEFAULTS } from '@edufish/qingzhou-ui';

/**
 * Harness-only copy. Adapter strings come from edufishUIResources; the
 * `preview` namespace labels this developer surface and is never imported by
 * the production adapter.
 */
export const previewResources = {
  'en-US': {
    title: 'EduFish Qingzhou UI preview',
    subtitle:
      'Developer harness only. Host providers live here; the adapter does not ship them.',
    controls: {
      appearance: 'Appearance',
      light: 'Light',
      dark: 'Dark',
      primary: 'Primary color',
      language: 'Language',
      transport: 'Data source',
    },
    transport: {
      demo: 'Schema fixtures (demo)',
      actual: 'Actual HTTP (loopback fixture)',
    },
    demo: {
      title: 'Demo transport',
      note: 'Injected transport with local schema fixtures. No network requests; write counts are local and explicit.',
      writes: 'Explicit writes',
      quiz: 'Quiz submits',
      lab: 'Lab starts',
      lastRequest: 'Last request id',
      none: 'none',
    },
    snapshots: {
      title: 'Eight result snapshots',
      note: 'Deterministic local fixtures, parsed against the core output schemas. Read-only history snapshots; never used as actual API responses.',
      'course.read': 'Course',
      'material.search': 'Material search',
      'graph.neighborhood': 'Knowledge graph',
      'quiz.read': 'Quiz',
      'quiz.submit': 'Quiz submission',
      'progress.read': 'Progress',
      'lab.start': 'Lab start',
      'lab.status': 'Lab status',
    },
    interactions: {
      title: 'Interactive components',
      quiz: 'QuizInteraction (explicit submit)',
      lab: 'LabLauncher (explicit start)',
      submitted: 'Submitted snapshot',
      started: 'Started snapshot',
    },
    actual: {
      title: 'Actual HTTP mode',
      note: 'Requests go through the Vite loopback proxy to examples/plugin-host/fixture_server.py. The JWT is minted by the fixture handshake and held in page memory only.',
      unavailable:
        'Actual HTTP mode is not configured. Start the harness with `npm run dev:actual` in this directory.',
      loadCourse: 'Read course (HTTP)',
      search: 'Search materials (HTTP)',
      readGraph: 'Read graph (HTTP)',
      readQuiz: 'Read quiz (HTTP)',
      readProgress: 'Read progress (HTTP)',
      labStatus: 'Refresh lab status (HTTP)',
      quizTitle: 'Actual quiz interaction',
      labTitle: 'Actual lab launcher',
      courseTitle: 'Actual course result',
      searchTitle: 'Actual material results',
      graphTitle: 'Actual graph result',
      quizResultTitle: 'Actual quiz result',
      progressTitle: 'Actual progress result',
      labResultTitle: 'Actual lab result',
      labStatusTitle: 'Actual lab status result',
      writes: 'Actual successful writes',
      submitted: 'Last submission',
      started: 'Last lab run',
      reloadNote:
        'Reloading replays rendered history only. Mount and replay must not issue quiz or lab writes.',
      noData: 'No request has been made yet.',
      error: 'Request failed',
    },
    states: {
      loading: 'Loading…',
      empty: 'No data',
      idle: 'Not loaded',
    },
  },
  'zh-CN': {
    title: 'EduFish 清舟 UI 预览',
    subtitle: '仅用于开发验证。宿主 Provider 只存在于本预览中，适配层不包含它们。',
    controls: {
      appearance: '外观',
      light: '浅色',
      dark: '深色',
      primary: '主色',
      language: '语言',
      transport: '数据来源',
    },
    transport: {
      demo: 'Schema 示例（演示）',
      actual: '真实 HTTP（本机 fixture）',
    },
    demo: {
      title: '演示传输',
      note: '注入式传输与本地 Schema 示例。不访问网络；写操作计数为本地显式统计。',
      writes: '显式写操作',
      quiz: '测验提交',
      lab: '实验启动',
      lastRequest: '最近请求 ID',
      none: '无',
    },
    snapshots: {
      title: '八个结果快照',
      note: '确定性的本地示例，已通过核心输出 Schema 校验。均为只读历史快照，不会作为真实 API 响应。',
      'course.read': '课程',
      'material.search': '资料检索',
      'graph.neighborhood': '知识图谱',
      'quiz.read': '测验',
      'quiz.submit': '测验提交',
      'progress.read': '学习进度',
      'lab.start': '实验启动',
      'lab.status': '实验状态',
    },
    interactions: {
      title: '交互组件',
      quiz: 'QuizInteraction（显式提交）',
      lab: 'LabLauncher（显式启动）',
      submitted: '提交快照',
      started: '启动快照',
    },
    actual: {
      title: '真实 HTTP 模式',
      note: '请求通过 Vite 本机代理转发到 examples/plugin-host/fixture_server.py。JWT 由 fixture 握手签发，仅保存在页面内存中。',
      unavailable: '未配置真实 HTTP 模式。请在本目录运行 `npm run dev:actual`。',
      loadCourse: '读取课程（HTTP）',
      search: '检索资料（HTTP）',
      readGraph: '读取图谱（HTTP）',
      readQuiz: '读取测验（HTTP）',
      readProgress: '读取进度（HTTP）',
      labStatus: '刷新实验状态（HTTP）',
      quizTitle: '真实测验交互',
      labTitle: '真实实验启动',
      courseTitle: '真实课程结果',
      searchTitle: '真实资料结果',
      graphTitle: '真实图谱结果',
      quizResultTitle: '真实测验结果',
      progressTitle: '真实进度结果',
      labResultTitle: '真实实验结果',
      labStatusTitle: '真实实验状态结果',
      writes: '真实成功写操作',
      submitted: '最近提交',
      started: '最近实验',
      reloadNote: '刷新页面只会重放已渲染的历史；挂载与重放不得发起测验或实验写操作。',
      noData: '尚未发起请求。',
      error: '请求失败',
    },
    states: {
      loading: '加载中…',
      empty: '暂无数据',
      idle: '未加载',
    },
  },
};

const resources = {};
for (const language of ['en-US', 'zh-CN']) {
  resources[language] = {
    edufish: {
      ...edufishUIResources[language].edufish,
      ...edufishLabResources[language].edufish,
      ...(language === 'zh-CN' ? BRAIN_ZH_DEFAULTS : BRAIN_EN_DEFAULTS),
    },
    preview: previewResources[language],
  };
}

export const i18n = i18next.createInstance();
i18n.use(initReactI18next).init({
  resources,
  lng: 'en-US',
  fallbackLng: 'en-US',
  supportedLngs: ['en-US', 'zh-CN'],
  ns: ['edufish', 'preview'],
  defaultNS: 'preview',
  interpolation: { escapeValue: false },
  initImmediate: false,
});

export default i18n;
