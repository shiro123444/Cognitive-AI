import type { ProgressReadOutput } from '@edufish/plugin';
import { useId } from 'react';

import type { ResultProps } from '../contracts.js';
import { EmptyState, mergeClassNames, useEduFishTranslation } from './shared.js';
import { styles } from './styles.js';

const MAX_RENDERED_EVENT_TYPES = 50;
const MAX_RENDERED_SUBMISSIONS = 100;
const MAX_RENDERED_LAB_EVIDENCE = 50;

/** Immutable progress snapshot: recorded activity, submissions and lab evidence. */
export function ProgressResult({
  data,
  className,
}: ResultProps<ProgressReadOutput>) {
  const t = useEduFishTranslation();
  const titleId = useId();

  const eventEntries = Object.entries(data.event_counts).sort(
    ([left], [right]) => left.localeCompare(right),
  );
  const visibleEvents = eventEntries.slice(0, MAX_RENDERED_EVENT_TYPES);
  const visibleSubmissions = data.quiz_submissions.slice(
    0,
    MAX_RENDERED_SUBMISSIONS,
  );
  const labEvidence = data.lab_evidence;
  const visibleLabEvidence =
    labEvidence?.runs.slice(0, MAX_RENDERED_LAB_EVIDENCE) ?? [];

  return (
    <section
      className={mergeClassNames(styles.root, className)}
      aria-labelledby={titleId}
    >
      <header className={styles.header}>
        <h3 className={styles.title} id={titleId}>
          {t('opProgressRead')}
        </h3>
        <div className={styles.tagRow}>
          <span className={styles.muted}>
            {t('progressCourse')}: {data.course_id}
          </span>
          <span className={styles.muted}>
            {t('progressStudent')}: {data.student_id}
          </span>
        </div>
      </header>

      <div>
        <h4 className={styles.subtitle}>{t('progressEvents')}</h4>
        {eventEntries.length === 0 ? (
          <EmptyState message={t('progressNoEvents')} />
        ) : (
          <ul className={styles.list}>
            {visibleEvents.map(([event, count]) => (
              <li className={styles.row} key={event}>
                <span>{event}</span>
                <strong>{count}</strong>
              </li>
            ))}
          </ul>
        )}
        {eventEntries.length > visibleEvents.length ? (
          <p className={styles.muted}>
            {t('progressMoreEvents', {
              count: eventEntries.length - visibleEvents.length,
            })}
          </p>
        ) : null}
      </div>

      <div>
        <h4 className={styles.subtitle}>{t('progressSubmissions')}</h4>
        {data.quiz_submissions.length === 0 ? (
          <EmptyState message={t('progressNoSubmissions')} />
        ) : (
          <ul className={styles.list}>
            {visibleSubmissions.map((submission, index) => (
              <li
                className={styles.card}
                key={`${submission.submission_id}-${index}`}
              >
                <div className={styles.row}>
                  <span>
                    {t('progressScore')}: {submission.score} /{' '}
                    {submission.total}
                  </span>
                  {submission.created_at ? (
                    <time
                      className={styles.muted}
                      dateTime={submission.created_at}
                    >
                      {t('progressCreatedAt')}: {submission.created_at}
                    </time>
                  ) : null}
                </div>
                <span className={styles.muted}>
                  {t('progressSubmissionId')}: {submission.submission_id}
                </span>
                <span className={styles.muted}>
                  {submission.chapter_id
                    ? `${t('quizChapter')}: ${submission.chapter_id}`
                    : t('progressChapterUnassigned')}
                </span>
              </li>
            ))}
          </ul>
        )}
        {data.quiz_submissions.length > visibleSubmissions.length ? (
          <p className={styles.muted}>
            {t('progressMoreSubmissions', {
              count:
                data.quiz_submissions.length - visibleSubmissions.length,
            })}
          </p>
        ) : null}
      </div>

      {labEvidence !== undefined ? (
        <div>
          <h4 className={styles.subtitle}>{t('progressLabEvidence')}</h4>
          <p className={styles.muted}>{t('progressLabEvidenceNotice')}</p>
          {visibleLabEvidence.length === 0 ? (
            <EmptyState message={t('progressNoLabEvidence')} />
          ) : (
            <ul className={styles.list}>
              {visibleLabEvidence.map((evidence, index) => (
                <li
                  className={styles.card}
                  key={`${evidence.run_id}-${index}`}
                >
                  <strong className={styles.body}>
                    {t('labRun')}: {evidence.run_id}
                  </strong>
                  <span className={styles.muted}>
                    {t('labTemplate')}: {evidence.template_id}
                  </span>
                  <span className={styles.muted}>
                    {t('labAdapter')}: {evidence.adapter}
                  </span>
                  {evidence.learning_context.concept_id !== null ? (
                    <span className={styles.muted}>
                      {t('progressLabConcept')}:{' '}
                      {evidence.learning_context.concept_id}
                    </span>
                  ) : null}
                  {evidence.learning_context.chapter_id !== null ? (
                    <span className={styles.muted}>
                      {t('progressLabChapter')}:{' '}
                      {evidence.learning_context.chapter_id}
                    </span>
                  ) : null}
                  {evidence.learning_context.activity_id !== null ? (
                    <span className={styles.muted}>
                      {t('progressLabActivity')}:{' '}
                      {evidence.learning_context.activity_id}
                    </span>
                  ) : null}
                  <time
                    className={styles.muted}
                    dateTime={evidence.completed_at}
                  >
                    {t('labCompletedAt')}: {evidence.completed_at}
                  </time>
                  <span className={styles.muted}>
                    {t('progressLabArtifactCount')}: {evidence.artifact_count}
                  </span>
                  <span className={styles.muted}>
                    {evidence.report_id === null
                      ? t('progressLabReportUnavailable')
                      : t('progressLabReportAvailable', {
                          id: evidence.report_id,
                        })}
                  </span>
                </li>
              ))}
            </ul>
          )}
          {labEvidence.runs.length > visibleLabEvidence.length ? (
            <p className={styles.muted}>
              {t('progressMoreLabEvidence', {
                count: labEvidence.runs.length - visibleLabEvidence.length,
              })}
            </p>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
