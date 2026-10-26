import type { QuizReadOutput } from '@edufish/plugin';
import { useId } from 'react';

import type { ResultProps } from '../contracts.js';
import { EmptyState, mergeClassNames, useEduFishTranslation } from './shared.js';
import { styles } from './styles.js';

/**
 * Read-only quiz snapshot. Only the prompt and identifier are rendered; any
 * canonical answer or explanation accidentally attached to an item is ignored.
 */
export function QuizResult({ data, className }: ResultProps<QuizReadOutput>) {
  const t = useEduFishTranslation();
  const titleId = useId();

  return (
    <section
      className={mergeClassNames(styles.root, className)}
      aria-labelledby={titleId}
    >
      <header className={styles.header}>
        <h3 className={styles.title} id={titleId}>
          {t('quizItems')}
        </h3>
        <span className={styles.muted}>{data.items.length}</span>
      </header>

      {data.items.length === 0 ? (
        <EmptyState message={t('quizEmpty')} />
      ) : (
        <ol className={styles.numberedList}>
          {data.items.map((item, index) => (
            <li className={styles.listItem} key={`${item.id}-${index}`}>
              <h4 className={styles.subtitle}>
                {t('quizPrompt')} {index + 1}
              </h4>
              <p className={styles.body}>{item.prompt}</p>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
