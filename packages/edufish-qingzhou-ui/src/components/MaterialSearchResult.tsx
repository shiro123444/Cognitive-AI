import type { MaterialSearchOutput } from '@edufish/plugin';
import { Button, Flexbox, Text } from '@lobehub/ui';
import { Tag } from 'antd';
import { useId } from 'react';

import type { EduFishReference, ResultProps } from '../contracts.js';
import { EmptyState, mergeClassNames, useEduFishTranslation } from './shared.js';
import { styles } from './styles.js';

/**
 * Read-only material search snapshot. An "open reference" control is rendered
 * only when the host supplies an explicit callback; the component never builds
 * URLs or touches the filesystem.
 */
export function MaterialSearchResult({
  data,
  className,
  onOpenReference,
}: ResultProps<MaterialSearchOutput>) {
  const t = useEduFishTranslation();
  const titleId = useId();

  const openReference = (result: MaterialSearchOutput['results'][number]) => {
    if (!onOpenReference) return;
    const reference: EduFishReference = {
      course_id: result.course_id,
      material_id: result.material_id,
      chunk_id: result.chunk_id,
      filename: result.filename,
      page_number: result.page_number,
      citation_locator: result.citation_locator,
    };
    onOpenReference(reference);
  };

  return (
    <section
      className={mergeClassNames(styles.root, className)}
      aria-labelledby={titleId}
    >
      <header className={styles.header}>
        <h3 className={styles.title} id={titleId}>
          {t('materialResults')}: {data.results.length}
        </h3>
        <Tag>{t('materialRetrievalKeyword')}</Tag>
      </header>

      {data.results.length === 0 ? (
        <EmptyState message={t('materialNoResults')} />
      ) : (
        <ul className={styles.list}>
          {data.results.map((result, index) => (
            <li
              className={styles.card}
              key={`${result.chunk_id}-${index}`}
            >
              <Flexbox
                horizontal
                align="center"
                className={styles.row}
                gap={8}
                justify="space-between"
              >
                <Text>
                  {result.filename} · {t('materialPage')} {result.page_number}
                </Text>
                {onOpenReference ? (
                  <Button
                    aria-label={`${t('a11yOpenReference')}: ${
                      result.filename
                    }, ${t('materialPage')} ${result.page_number}`}
                    htmlType="button"
                    onClick={() => openReference(result)}
                    size="small"
                  >
                    {t('materialOpenReference')}
                  </Button>
                ) : null}
              </Flexbox>

              {result.heading ? (
                <span className={styles.muted}>
                  {t('materialHeading')}: {result.heading}
                </span>
              ) : null}

              <p className={styles.body}>{result.content}</p>

              <span className={styles.muted}>
                {t('materialCitation')}: {result.citation_locator}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
