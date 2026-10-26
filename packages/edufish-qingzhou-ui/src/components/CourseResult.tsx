import type { CourseReadOutput } from '@edufish/plugin';
import { Flexbox, Text } from '@lobehub/ui';
import { Tag } from 'antd';
import { useId } from 'react';

import type { ResultProps } from '../contracts.js';
import { EmptyState, mergeClassNames, useEduFishTranslation } from './shared.js';
import { styles } from './styles.js';

const MAX_RENDERED_CHAPTERS = 100;

/** Immutable snapshot of a course and its ordered chapters. */
export function CourseResult({
  data,
  className,
}: ResultProps<CourseReadOutput>) {
  const t = useEduFishTranslation();
  const titleId = useId();
  const chapters = [...data.chapters].sort(
    (left, right) =>
      left.order - right.order || left.title.localeCompare(right.title),
  );
  const visibleChapters = chapters.slice(0, MAX_RENDERED_CHAPTERS);

  return (
    <section
      className={mergeClassNames(styles.root, className)}
      aria-labelledby={titleId}
    >
      <header className={styles.header}>
        <div>
          <div className={styles.muted}>{t('courseTitle')}</div>
          <h3 className={styles.title} id={titleId}>
            {data.course.title}
          </h3>
        </div>
        <Tag aria-label={`${t('courseStatus')}: ${data.course.status}`}>
          {data.course.status}
        </Tag>
      </header>

      {data.course.summary ? (
        <div>
          <h4 className={styles.subtitle}>{t('courseSummary')}</h4>
          <p className={styles.body}>{data.course.summary}</p>
        </div>
      ) : null}

      <div>
        <h4 className={styles.subtitle}>
          {t('courseChapters')}: {chapters.length}
        </h4>
        {chapters.length === 0 ? (
          <EmptyState message={t('courseNoChapters')} />
        ) : (
          <ol className={styles.numberedList}>
            {visibleChapters.map((chapter, index) => (
              <li className={styles.listItem} key={`${chapter.id}-${index}`}>
                <Flexbox
                  horizontal
                  align="center"
                  className={styles.row}
                  gap={8}
                  justify="space-between"
                >
                  <Text>{chapter.title}</Text>
                  <span className={styles.muted}>
                    {t('courseChapterOrder', { order: chapter.order })}
                  </span>
                </Flexbox>
                {chapter.objectives ? (
                  <div>
                    <h5 className={styles.subtitle}>
                      {t('courseObjectives')}
                    </h5>
                    <p className={styles.body}>{chapter.objectives}</p>
                  </div>
                ) : null}
              </li>
            ))}
          </ol>
        )}
        {chapters.length > visibleChapters.length ? (
          <p className={styles.muted}>
            {t('courseMoreChapters', {
              count: chapters.length - visibleChapters.length,
            })}
          </p>
        ) : null}
      </div>
    </section>
  );
}
