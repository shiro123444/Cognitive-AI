import type { ProgressReadOutput } from '@edufish/plugin';
import { useId } from 'react';

import type { ResultProps } from '../contracts.js';
import { EmptyState, mergeClassNames, useEduFishTranslation } from './shared.js';
import { styles } from './styles.js';

const MAX_RENDERED_EVENT_TYPES = 50;
const MAX_RENDERED_SUBMISSIONS = 100;

/** Immutable progress snapshot: activity counters and recent submissions. */
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
    </section>
  );
}
