import { LabLauncher, LabResult, QuizInteraction, QuizSubmissionResult } from '@edufish/qingzhou-ui';
import { Card, Typography } from 'antd';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { fixtures } from './fixtures.js';

export function DemoPanel({ writes }) {
  const { t } = useTranslation('preview');
  const [submission, setSubmission] = useState(null);
  const [started, setStarted] = useState(null);

  return (
    <section data-testid="demo-panel">
      <Typography.Title level={3}>{t('demo.title')}</Typography.Title>
      <Typography.Paragraph type="secondary">{t('demo.note')}</Typography.Paragraph>

      <Card size="small" data-testid="demo-writes">
        <div className="stat-row">
          <div>
            <Typography.Text type="secondary">{t('demo.quiz')}</Typography.Text>
            <Typography.Title level={3}>
              <span data-testid="demo-quiz-count">{writes.quiz}</span>
            </Typography.Title>
          </div>
          <div>
            <Typography.Text type="secondary">{t('demo.lab')}</Typography.Text>
            <Typography.Title level={3}>
              <span data-testid="demo-lab-count">{writes.lab}</span>
            </Typography.Title>
          </div>
        </div>
        <Typography.Text type="secondary">
          {t('demo.lastRequest')}: <code data-testid="demo-last-request">{writes.lastRequestId || t('demo.none')}</code>
        </Typography.Text>
      </Card>

      <Typography.Title level={4}>{t('interactions.title')}</Typography.Title>

      <Card title={t('interactions.quiz')} size="small" className="interaction-card">
        <div data-testid="quiz-interaction">
          <QuizInteraction
            chapterId="chapter-fixture-search"
            courseId="course-fixture-published"
            items={fixtures['quiz.read'].items}
            onSubmitted={(result) => setSubmission(result)}
          />
        </div>
        {submission ? (
          <div className="inline-result" data-testid="demo-quiz-result">
            <Typography.Text strong>{t('interactions.submitted')}</Typography.Text>
            <QuizSubmissionResult data={submission} />
          </div>
        ) : null}
      </Card>

      <Card title={t('interactions.lab')} size="small" className="interaction-card">
        <div data-testid="lab-launcher">
          <LabLauncher
            courseId="course-fixture-published"
            params={{ stimulus_current: 8, duration_ms: 120 }}
            templateId="exp-neuron-spike"
            onStarted={(result) => setStarted(result)}
          />
        </div>
        {started ? (
          <div className="inline-result" data-testid="demo-lab-result">
            <Typography.Text strong>{t('interactions.started')}</Typography.Text>
            <LabResult data={started} />
          </div>
        ) : null}
      </Card>
    </section>
  );
}
