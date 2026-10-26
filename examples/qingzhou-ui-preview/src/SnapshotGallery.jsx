import {
  CourseResult,
  GraphResult,
  LabResult,
  MaterialSearchResult,
  ProgressResult,
  QuizResult,
  QuizSubmissionResult,
} from '@edufish/qingzhou-ui';
import { Card, Typography } from 'antd';
import { useTranslation } from 'react-i18next';
import { fixtures } from './fixtures.js';

function Snapshot({ name }) {
  switch (name) {
    case 'course.read':
      return <CourseResult data={fixtures['course.read']} />;
    case 'material.search':
      return <MaterialSearchResult data={fixtures['material.search']} />;
    case 'graph.neighborhood':
      return <GraphResult data={fixtures['graph.neighborhood']} />;
    case 'quiz.read':
      return <QuizResult data={fixtures['quiz.read']} />;
    case 'quiz.submit':
      return <QuizSubmissionResult data={fixtures['quiz.submit']} />;
    case 'progress.read':
      return <ProgressResult data={fixtures['progress.read']} />;
    case 'lab.start':
      return <LabResult data={fixtures['lab.start']} />;
    case 'lab.status':
      return <LabResult data={fixtures['lab.status']} />;
    default:
      return null;
  }
}

export function SnapshotGallery({ names }) {
  const { t } = useTranslation('preview');

  return (
    <section data-testid="snapshot-gallery">
      <Typography.Title level={3}>{t('snapshots.title')}</Typography.Title>
      <Typography.Paragraph type="secondary">
        {t('snapshots.note')}
      </Typography.Paragraph>
      <div className="snapshot-grid">
        {names.map((name) => (
          <Card
            key={name}
            data-testid={`snapshot-${name.replaceAll('.', '-')}`}
            size="small"
            title={<code>{name}</code>}
          >
            <Snapshot name={name} />
          </Card>
        ))}
      </div>
    </section>
  );
}
