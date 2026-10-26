import type { LabStartOutput } from '@edufish/plugin';
import { Button } from '@lobehub/ui';
import { Alert } from 'antd';
import { useId, useRef, useState } from 'react';

import { useEduFishAction } from '../actions.js';
import type { LabLauncherProps } from '../contracts.js';
import { useRequiredEduFishUIContext } from '../provider.js';
import { LabResult } from './LabResult.js';
import { EmptyState, useEduFishTranslation } from './shared.js';
import { styles } from './styles.js';

/**
 * Explicit lab starter. Remounting on course/template changes discards local
 * wait state; starting is always a direct user action and never a mount effect.
 */
export function LabLauncher(props: LabLauncherProps) {
  const { identityKey } = useRequiredEduFishUIContext();
  return (
    <LabLauncherSession
      key={JSON.stringify([identityKey, props.courseId, props.templateId])}
      {...props}
    />
  );
}

function LabLauncherSession({
  courseId,
  templateId,
  params,
  onStarted,
}: LabLauncherProps) {
  const t = useEduFishTranslation();
  const titleId = useId();
  const action = useEduFishAction('edufish.lab.start');
  const startingRef = useRef(false);
  const [cancelled, setCancelled] = useState(false);
  const [localFailed, setLocalFailed] = useState(false);

  async function startLab() {
    if (startingRef.current) return;
    startingRef.current = true;
    setCancelled(false);
    setLocalFailed(false);
    try {
      // A second explicit start is a new run, not a replay of the completed
      // write identity. reset() is synchronous and clears the hook's ids.
      if (action.data) action.reset();
      const result = await action.run({
        course_id: courseId,
        template_id: templateId,
        ...(params === undefined ? {} : { params }),
      });
      if (result) onStarted?.(result);
    } catch {
      // The hook normally reports failures through `error`; keep the launcher
      // honest and retryable if an unexpected rejection escapes it.
      setLocalFailed(true);
    } finally {
      startingRef.current = false;
    }
  }

  function cancelWait() {
    action.cancel();
    setCancelled(true);
  }

  const failed = Boolean(action.error || localFailed) && !cancelled;
  const run: LabStartOutput | undefined = action.data;

  return (
    <section
      aria-busy={action.pending}
      aria-labelledby={titleId}
      className={styles.root}
    >
      <header className={styles.header}>
        <div>
          <h3 className={styles.title} id={titleId}>
            {t('a11yLabLauncher')}
          </h3>
          <p className={styles.body}>{t('labLauncherDescription')}</p>
        </div>
      </header>

      <div className={styles.actions}>
        <Button
          disabled={action.pending}
          htmlType="button"
          loading={action.pending}
          onClick={() => {
            void startLab();
          }}
          type="primary"
        >
          {action.pending
            ? t('labStarting')
            : failed
              ? t('labRetry')
              : t('labStart')}
        </Button>

        {action.pending ? (
          <Button htmlType="button" onClick={cancelWait}>
            {t('labCancelWait')}
          </Button>
        ) : null}
      </div>

      {action.pending ? (
        <p className={styles.muted} role="status">
          {t('labStarting')}
        </p>
      ) : null}

      <p className={styles.muted}>{t('labCancelNotice')}</p>

      {cancelled ? (
        <Alert showIcon title={t('errorCancelled')} type="info" />
      ) : null}

      {failed ? (
        <Alert showIcon title={t('resultError')} type="error" />
      ) : null}

      {run ? (
        <LabResult data={run} />
      ) : (
        <EmptyState message={t('labNotStarted')} />
      )}
    </section>
  );
}
