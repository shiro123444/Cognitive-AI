import type { QuizSubmitOutput } from '@edufish/plugin';
import { Text } from '@lobehub/ui';
import { Tag } from 'antd';
import { useId } from 'react';

import type { ResultProps } from '../contracts.js';
import { EmptyState, mergeClassNames, useEduFishTranslation } from './shared.js';
import { styles } from './styles.js';

/** Immutable snapshot of one quiz submission and its per-item feedback. */
export function QuizSubmissionResult({
  data,
  className,
}: ResultProps<QuizSubmitOutput>) {
  const t = useEduFishTranslation();
  const titleId = useId();

  return (
    <section
      className={mergeClassNames(styles.root, className)}
      aria-labelledby={titleId}
    >
      <header className={styles.header}>
        <div>
          <h3 className={styles.title} id={titleId}>
            {t('quizSubmitted')}
          </h3>
          <Text className={styles.muted}>
            {t('quizSubmission')}: {data.submission_id}
          </Text>
        </div>
        <Tag color={data.score === data.total ? 'success' : 'default'}>
          {t('quizScore')}: {data.score} / {data.total}
        </Tag>
      </header>

      <h4 className={styles.subtitle}>{t('quizResults')}</h4>
      {data.results.length === 0 ? (
        <EmptyState message={t('noData')} />
      ) : (
        <ol className={styles.numberedList}>
          {data.results.map((result, index) => (
            <li
              className={styles.card}
              key={`${result.quiz_id}-${index}`}
            >
              <div className={styles.row}>
                <span className={styles.muted}>
                  {t('id')}: {result.quiz_id}
                </span>
                <Tag color={result.correct ? 'success' : 'error'}>
                  {result.correct ? t('quizCorrect') : t('quizIncorrect')}
                </Tag>
              </div>
              {result.feedback ? (
                <div>
                  <h4 className={styles.subtitle}>{t('quizFeedback')}</h4>
                  <p className={styles.body}>{result.feedback}</p>
                </div>
              ) : null}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
