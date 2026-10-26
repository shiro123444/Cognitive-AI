import {
  CourseResult,
  GraphResult,
  LabLauncher,
  LabResult,
  MaterialSearchResult,
  ProgressResult,
  QuizInteraction,
  QuizSubmissionResult,
  useEduFishAction,
} from '@edufish/qingzhou-ui';
import { Alert, Button, Card, Empty, Typography } from 'antd';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

const COURSE_ID = 'course-fixture-published';
const CHAPTER_ID = 'chapter-fixture-search';
const TEMPLATE_ID = 'exp-neuron-spike';

function RequestStatus({ action, testId }) {
  const { t } = useTranslation('preview');

  if (action.pending) {
    return (
      <Typography.Text type="secondary" data-testid={`${testId}-pending`}>
        {t('states.loading')}
      </Typography.Text>
    );
  }
  if (action.error) {
    return (
      <Alert
        data-testid={`${testId}-error`}
        description={`${action.error.code}: ${action.error.message}`}
        message={t('actual.error')}
        showIcon
        type="error"
      />
    );
  }
  return null;
}

/**
 * Actual HTTP path. Every request is triggered by an explicit control; the
 * action hooks are not allowed to call on mount or on history replay.
 */
export function ActualPanel({ httpAvailable }) {
  const { t } = useTranslation('preview');

  const course = useEduFishAction('edufish.course.read');
  const search = useEduFishAction('edufish.material.search');
  const graph = useEduFishAction('edufish.graph.neighborhood');
  const quiz = useEduFishAction('edufish.quiz.read');
  const progress = useEduFishAction('edufish.progress.read');
  const labStatus = useEduFishAction('edufish.lab.status');

  const [submission, setSubmission] = useState(null);
  const [started, setStarted] = useState(null);
  const [submittedCount, setSubmittedCount] = useState(0);
  const [startedCount, setStartedCount] = useState(0);

  if (!httpAvailable) {
    return (
      <Alert
        data-testid="actual-http-unavailable"
        description={t('actual.unavailable')}
        message={t('actual.title')}
        showIcon
        type="info"
      />
    );
  }

  const quizItems = quiz.data?.items ?? [];
  const quizKey = quizItems.map((item) => item.id).join('|') || 'empty';

  return (
    <section data-testid="actual-panel">
      <Typography.Title level={3}>{t('actual.title')}</Typography.Title>
      <Typography.Paragraph type="secondary">{t('actual.note')}</Typography.Paragraph>
      <Typography.Paragraph type="secondary">{t('actual.reloadNote')}</Typography.Paragraph>

      <Card className="actual-writes" data-testid="actual-writes" size="small">
        <div className="stat-row">
          <div>
            <Typography.Text type="secondary">{t('demo.quiz')}</Typography.Text>
            <Typography.Title level={3}>
              <span data-testid="actual-quiz-count">{submittedCount}</span>
            </Typography.Title>
          </div>
          <div>
            <Typography.Text type="secondary">{t('demo.lab')}</Typography.Text>
            <Typography.Title level={3}>
              <span data-testid="actual-lab-count">{startedCount}</span>
            </Typography.Title>
          </div>
        </div>
      </Card>

      <Card
        data-testid="actual-course-card"
        extra={<Button data-testid="actual-load-course" loading={course.pending} onClick={() => course.run({ course_id: COURSE_ID })} size="small">{t('actual.loadCourse')}</Button>}
        size="small"
        title={t('actual.courseTitle')}
      >
        <RequestStatus action={course} testId="actual-course" />
        {course.data ? <CourseResult data={course.data} /> : <Typography.Text type="secondary">{t('actual.noData')}</Typography.Text>}
      </Card>

      <Card
        data-testid="actual-search-card"
        extra={<Button data-testid="actual-search" loading={search.pending} onClick={() => search.run({ course_id: COURSE_ID, query: 'heuristic', limit: 5 })} size="small">{t('actual.search')}</Button>}
        size="small"
        title={t('actual.searchTitle')}
      >
        <RequestStatus action={search} testId="actual-search" />
        {search.data ? <MaterialSearchResult data={search.data} /> : <Typography.Text type="secondary">{t('actual.noData')}</Typography.Text>}
      </Card>

      <Card
        data-testid="actual-graph-card"
        extra={<Button data-testid="actual-read-graph" loading={graph.pending} onClick={() => graph.run({ course_id: COURSE_ID, concept_id: 'concept-fixture-heuristic', depth: 1, limit: 20 })} size="small">{t('actual.readGraph')}</Button>}
        size="small"
        title={t('actual.graphTitle')}
      >
        <RequestStatus action={graph} testId="actual-graph" />
        {graph.data ? <GraphResult data={graph.data} /> : <Typography.Text type="secondary">{t('actual.noData')}</Typography.Text>}
      </Card>

      <Card
        data-testid="actual-quiz-card"
        extra={<Button data-testid="actual-read-quiz" loading={quiz.pending} onClick={() => quiz.run({ course_id: COURSE_ID, chapter_id: CHAPTER_ID, limit: 5 })} size="small">{t('actual.readQuiz')}</Button>}
        size="small"
        title={t('actual.quizTitle')}
      >
        <RequestStatus action={quiz} testId="actual-quiz" />
        {quiz.data ? (
          quizItems.length === 0 ? (
            <Empty description={t('states.empty')} />
          ) : (
            <div data-testid="actual-quiz-interaction">
              <QuizInteraction
                key={quizKey}
                chapterId={CHAPTER_ID}
                courseId={COURSE_ID}
                items={quizItems}
                onSubmitted={(result) => {
                  setSubmission(result);
                  setSubmittedCount((value) => value + 1);
                }}
              />
            </div>
          )
        ) : (
          <Typography.Text type="secondary">{t('actual.noData')}</Typography.Text>
        )}
        {submission ? (
          <div className="inline-result" data-testid="actual-quiz-submission">
            <Typography.Text strong>{t('actual.submitted')}</Typography.Text>
            <QuizSubmissionResult data={submission} />
          </div>
        ) : null}
      </Card>

      <Card
        data-testid="actual-progress-card"
        extra={<Button data-testid="actual-read-progress" loading={progress.pending} onClick={() => progress.run({ course_id: COURSE_ID })} size="small">{t('actual.readProgress')}</Button>}
        size="small"
        title={t('actual.progressTitle')}
      >
        <RequestStatus action={progress} testId="actual-progress" />
        {progress.data ? <ProgressResult data={progress.data} /> : <Typography.Text type="secondary">{t('actual.noData')}</Typography.Text>}
      </Card>

      <Card
        data-testid="actual-lab-card"
        size="small"
        title={t('actual.labTitle')}
      >
        <div data-testid="actual-lab-interaction">
          <LabLauncher
            courseId={COURSE_ID}
            params={{ stimulus_current: 8, duration_ms: 120 }}
            templateId={TEMPLATE_ID}
            onStarted={(result) => {
              setStarted(result);
              setStartedCount((value) => value + 1);
              labStatus.reset();
            }}
          />
        </div>
        {started ? (
          <div className="inline-result" data-testid="actual-lab-result">
            <Typography.Text strong>{t('actual.started')}</Typography.Text>
            <LabResult data={started} />
          </div>
        ) : null}
      </Card>

      <Card
        data-testid="actual-lab-status-card"
        extra={<Button data-testid="actual-lab-status" disabled={!started} loading={labStatus.pending} onClick={() => started && labStatus.run({ course_id: COURSE_ID, run_id: started.run.id })} size="small">{t('actual.labStatus')}</Button>}
        size="small"
        title={t('actual.labStatusTitle')}
      >
        <RequestStatus action={labStatus} testId="actual-lab-status" />
        {labStatus.data ? <LabResult data={labStatus.data} /> : <Typography.Text type="secondary">{t('actual.noData')}</Typography.Text>}
      </Card>
    </section>
  );
}
