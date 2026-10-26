import { Button as LobeButton, Flexbox } from '@lobehub/ui';
import { Button as AntdButton, Card, Segmented, Select, Typography } from 'antd';
import { EduFishUIProvider } from '@edufish/qingzhou-ui';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActualPanel } from './ActualPanel.jsx';
import { disposeActualClient, getActualClient, HTTP_AVAILABLE } from './actual/client.js';
import { createDemoTransport } from './demo/transport.js';
import { DemoPanel } from './DemoPanel.jsx';
import { HostProviders } from './harness/providers.jsx';
import { i18n } from './harness/i18n.js';
import { SHORT_OPERATIONS } from './fixtures.js';
import { SnapshotGallery } from './SnapshotGallery.jsx';
import { LabPlayground } from './LabPlayground.jsx';

const EMPTY_WRITES = { quiz: 0, lab: 0, lastRequestId: '' };
const INITIAL_VIEW = new URLSearchParams(window.location.search).get('view') === 'validation' ? 'validation' : 'lab';

function AppControls({
  language,
  onLanguage,
  onPrimaryChange,
  onThemeMode,
  onTransportMode,
  primaryColor,
  themeMode,
  transportMode,
  validation,
}) {
  const { t } = useTranslation('preview');

  return (
    <Card className="controls-card" data-testid="preview-controls" size="small">
      <Flexbox className="controls-row" gap={16} horizontal wrap="wrap">
        <label className="control">
          <span>{t('controls.appearance')}</span>
          <Segmented
            data-testid="theme-mode"
            options={[
              { label: t('controls.light'), value: 'light' },
              { label: t('controls.dark'), value: 'dark' },
            ]}
            value={themeMode}
            onChange={onThemeMode}
          />
        </label>

        <label className="control">
          <span>{t('controls.primary')}</span>
          <Segmented
            aria-label={t('controls.primary')}
            data-testid="primary-color"
            options={[
              { label: 'Blue', value: 'blue' },
              { label: 'Cyan', value: 'cyan' },
              { label: 'Purple', value: 'purple' },
            ]}
            onChange={onPrimaryChange}
            value={primaryColor}
          />
        </label>

        <label className="control">
          <span>{t('controls.language')}</span>
          <Select
            aria-label={t('controls.language')}
            data-testid="language-select"
            onChange={onLanguage}
            options={[
              { label: 'English (en-US)', value: 'en-US' },
              { label: '中文 (zh-CN)', value: 'zh-CN' },
            ]}
            value={language}
          />
        </label>

        {validation && <label className="control">
          <span>{t('controls.transport')}</span>
          <Segmented
            data-testid="transport-mode"
            options={[
              { label: t('transport.demo'), value: 'demo' },
              { label: t('transport.actual'), value: 'actual' },
            ]}
            value={transportMode}
            onChange={onTransportMode}
          />
        </label>}

        {validation && <div className="probes">
          <LobeButton data-testid="lobe-probe" type="primary">
            {t('title')}
          </LobeButton>
          <AntdButton data-testid="token-probe" type="primary">
            {t('title')}
          </AntdButton>
          <Card data-testid="surface-probe" size="small">
            {t('subtitle')}
          </Card>
        </div>}
      </Flexbox>
    </Card>
  );
}

export default function App() {
  const [themeMode, setThemeMode] = useState('light');
  const [primaryColor, setPrimaryColor] = useState('blue');
  const [language, setLanguage] = useState(INITIAL_VIEW === 'lab' ? 'zh-CN' : 'en-US');
  const [view, setView] = useState(INITIAL_VIEW);
  const [transportMode, setTransportMode] = useState(INITIAL_VIEW === 'lab' && HTTP_AVAILABLE ? 'actual' : 'demo');
  const [writes, setWrites] = useState(EMPTY_WRITES);

  const sessionId = useMemo(
    () => (globalThis.crypto?.randomUUID?.() ?? `preview-${Date.now()}`),
    [],
  );
  const sessionIdRef = useRef(sessionId);
  sessionIdRef.current = sessionId;

  const handleWrite = useCallback(({ operation, requestId }) => {
    setWrites((previous) => ({
      quiz: previous.quiz + (operation === 'edufish.quiz.submit' ? 1 : 0),
      lab: previous.lab + (operation === 'edufish.lab.start' ? 1 : 0),
      lastRequestId: requestId ?? '',
    }));
  }, []);

  const demoTransport = useMemo(
    () => createDemoTransport({ onWrite: handleWrite }),
    [handleWrite],
  );

  const actualClient = useMemo(
    () => (transportMode === 'actual' && HTTP_AVAILABLE ? getActualClient() : null),
    [transportMode],
  );

  useEffect(() => {
    if (transportMode !== 'actual') return undefined;
    return () => {
      disposeActualClient();
    };
  }, [transportMode]);

  const getInvocation = useCallback(
    () => ({
      scope: { userId: 'fixture-student', sessionId: sessionIdRef.current },
    }),
    [],
  );

  const client = transportMode === 'actual' && actualClient ? actualClient : demoTransport;
  const identityKey = `${transportMode}:fixture-student`;

  const changeLanguage = useCallback((value) => {
    setLanguage(value);
    void i18n.changeLanguage(value);
  }, []);

  useEffect(() => { void i18n.changeLanguage(language); }, [language]);

  const changeView = (nextView) => {
    setView(nextView);
    setTransportMode(nextView === 'lab' && HTTP_AVAILABLE ? 'actual' : 'demo');
  };

  return (
    <HostProviders i18n={i18n} primaryColor={primaryColor} themeMode={themeMode}>
      <main className="preview-shell" data-testid="preview-root">
          <header className="preview-header">
            <Typography.Title data-testid="preview-heading" level={1}>
              {view === 'validation' ? i18n.t('title', { ns: 'preview' }) : language.startsWith('zh') ? '神经实验台' : 'Neuroscience laboratory'}
            </Typography.Title>
            <Typography.Paragraph type="secondary">
              {view === 'validation'
                ? i18n.t('subtitle', { ns: 'preview' })
                : language.startsWith('zh') ? '调整刺激与离子通道，探索电生理响应；切换脑解剖查看 3D 表面和 MRI。' : 'Explore electrophysiology by adjusting stimulation and ion channels, or open brain anatomy to view 3D surfaces and MRI.'}
            </Typography.Paragraph>
          </header>

          <div className="preview-page-tabs">
            <Segmented
              aria-label={language.startsWith('zh') ? '预览页面' : 'Preview page'}
              options={[
                { label: language.startsWith('zh') ? '实验台' : 'Laboratory', value: 'lab' },
                { label: language.startsWith('zh') ? '接口与组件验收' : 'API and component validation', value: 'validation' },
              ]}
              value={view}
              onChange={changeView}
            />
          </div>

          <AppControls
            language={language}
            onLanguage={changeLanguage}
            onPrimaryChange={setPrimaryColor}
            onThemeMode={setThemeMode}
            onTransportMode={setTransportMode}
            primaryColor={primaryColor}
            themeMode={themeMode}
            transportMode={transportMode}
            validation={view === 'validation'}
          />

          <EduFishUIProvider
            client={client}
            getInvocation={getInvocation}
            identityKey={identityKey}
            key={transportMode}
          >
            {view === 'lab'
              ? <LabPlayground httpAvailable={HTTP_AVAILABLE} />
              : transportMode === 'demo' ? <DemoPanel writes={writes} /> : <ActualPanel httpAvailable={HTTP_AVAILABLE} />}
          </EduFishUIProvider>

          {view === 'validation' && <SnapshotGallery names={SHORT_OPERATIONS} />}
        </main>
    </HostProviders>
  );
}
