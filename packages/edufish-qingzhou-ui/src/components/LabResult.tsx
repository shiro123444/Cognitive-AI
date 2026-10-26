import type { LabStartOutput } from '@edufish/plugin';
import { Text } from '@lobehub/ui';
import { Alert, Progress, Tag } from 'antd';
import { useId } from 'react';

import type { ResultProps } from '../contracts.js';
import {
  EmptyState,
  mergeClassNames,
  statusTone,
  useEduFishTranslation,
} from './shared.js';
import { styles } from './styles.js';

/**
 * Immutable snapshot of an experiment run. Artifact payloads (`data`) are
 * opaque and deliberately not rendered; only safe metadata is shown.
 */
export function LabResult({ data, className }: ResultProps<LabStartOutput>) {
  const t = useEduFishTranslation();
  const titleId = useId();
  const run = data.run;

  return (
    <section
      className={mergeClassNames(styles.root, className)}
      aria-labelledby={titleId}
    >
      <header className={styles.header}>
        <div>
          <h3 className={styles.title} id={titleId}>
            {t('labRun')}
          </h3>
          <span className={styles.muted}>
            {t('labTemplate')}: {run.template_id}
          </span>
        </div>
        <Tag
          aria-label={`${t('labStatus')}: ${run.status}`}
          color={statusTone(run.status)}
        >
          {run.status}
        </Tag>
      </header>

      <div className={styles.tagRow}>
        <span className={styles.muted}>
          {t('labAdapter')}: {run.adapter}
        </span>
        {run.created_at ? (
          <time className={styles.muted} dateTime={run.created_at}>
            {t('labStartedAt')}: {run.created_at}
          </time>
        ) : null}
        {run.completed_at ? (
          <time className={styles.muted} dateTime={run.completed_at}>
            {t('labCompletedAt')}: {run.completed_at}
          </time>
        ) : null}
      </div>

      <div>
        <span className={styles.muted}>
          {t('labProgress')}: {run.progress}%
        </span>
        <Progress percent={run.progress} size="small" />
        {run.progress_message ? (
          <p className={styles.body}>
            {t('labProgressMessage')}: {run.progress_message}
          </p>
        ) : null}
      </div>

      {run.error_message ? (
        <Alert
          description={run.error_message}
          showIcon
          title={t('labError')}
          type="error"
        />
      ) : null}

      <div>
        <h4 className={styles.subtitle}>
          {t('labArtifacts')}: {run.artifacts.length}
        </h4>
        {run.artifacts.length === 0 ? (
          <EmptyState message={t('labNoArtifacts')} />
        ) : (
          <ul className={styles.scrollList}>
            {run.artifacts.map((artifact, index) => (
              <li
                className={styles.card}
                key={`${artifact.id}-${index}`}
              >
                <div className={styles.row}>
                  <Text>{artifact.title}</Text>
                  <Tag>
                    {t('labArtifactType')}: {artifact.artifact_type}
                  </Tag>
                </div>
                <span className={styles.muted}>{artifact.id}</span>
                {artifact.created_at ? (
                  <time
                    className={styles.muted}
                    dateTime={artifact.created_at}
                  >
                    {t('createdAt')}: {artifact.created_at}
                  </time>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </div>

      {run.report ? (
        <div>
          <h4 className={styles.subtitle}>{t('labReport')}</h4>
          <p className={styles.body}>
            {t('labReportStatus')}: {run.report.status}
          </p>
        </div>
      ) : null}
    </section>
  );
}
