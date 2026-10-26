import { MAX_ANSWER_LENGTH } from '@edufish/plugin';
import type { QuizSubmitOutput } from '@edufish/plugin';
import { Button } from '@lobehub/ui';
import { Alert, Form, Input } from 'antd';
import { useId, useRef, useState } from 'react';

import { useEduFishAction } from '../actions.js';
import type { QuizInteractionProps } from '../contracts.js';
import { useRequiredEduFishUIContext } from '../provider.js';
import { QuizSubmissionResult } from './QuizSubmissionResult.js';
import { EmptyState, useEduFishTranslation } from './shared.js';
import { styles } from './styles.js';

function scopeKey(courseId: string, chapterId: string, itemIds: string[]) {
  return JSON.stringify([courseId, chapterId, ...itemIds]);
}

/**
 * Interactive quiz. The form is keyed by course/chapter/item identity, so a
 * scope change remounts it, aborts stale waits and clears private answers.
 */
export function QuizInteraction(props: QuizInteractionProps) {
  const { identityKey } = useRequiredEduFishUIContext();
  return (
    <QuizInteractionForm
      key={identityKey + ':' + scopeKey(
        props.courseId,
        props.chapterId,
        props.items.map((item) => item.id),
      )}
      {...props}
    />
  );
}

function QuizInteractionForm({
  courseId,
  chapterId,
  items,
  onSubmitted,
}: QuizInteractionProps) {
  const t = useEduFishTranslation();
  const titleId = useId();
  const formName = useId().replace(/:/g, '');
  const [form] = Form.useForm<Record<string, string>>();
  const action = useEduFishAction('edufish.quiz.submit');
  const [submission, setSubmission] = useState<QuizSubmitOutput>();
  const [localError, setLocalError] = useState<string>();
  const submittingRef = useRef(false);
  const hasItems = items.length > 0;
  const failureMessage = `${t('resultError')} ${t('quizAnswersPersisted')}`;

  async function handleSubmit(values: Record<string, string>) {
    if (!hasItems || submittingRef.current) return;

    const answers = items.map((item, index) => ({
      quiz_id: item.id,
      answer: values[`answer_${index}`] ?? '',
    }));

    if (answers.some((answer) => answer.answer.trim().length === 0)) {
      setLocalError(t('quizAnswerRequired'));
      return;
    }

    setLocalError(undefined);
    submittingRef.current = true;
    try {
      const result = await action.run({
        course_id: courseId,
        chapter_id: chapterId,
        answers,
      });
      if (result) {
        setSubmission(result);
        onSubmitted?.(result);
      }
    } catch {
      // The action hook normally exposes failures through `error`; keep the
      // form usable if an unexpected rejection escapes it.
      setLocalError(failureMessage);
    } finally {
      submittingRef.current = false;
    }
  }

  const showError = Boolean(action.error || localError) && !submission;

  return (
    <section
      aria-busy={action.pending}
      aria-labelledby={titleId}
      className={styles.root}
    >
      <header className={styles.header}>
        <h3 className={styles.title} id={titleId}>
          {t('quizFormLabel')}
        </h3>
        <span className={styles.muted}>
          {t('quizItems')}: {items.length}
        </span>
      </header>

      {!hasItems ? (
        <EmptyState message={t('quizEmpty')} />
      ) : (
        <Form
          aria-label={t('quizFormLabel')}
          form={form}
          layout="vertical"
          name={formName}
          onFinish={(values) => {
            void handleSubmit(values);
          }}
          requiredMark={false}
        >
          {items.map((item, index) => (
            <Form.Item
              className={styles.formItem}
              key={`${item.id}-${index}`}
              label={<span className={styles.body}>{item.prompt}</span>}
              name={`answer_${index}`}
              rules={[
                {
                  required: true,
                  whitespace: true,
                  message: t('quizAnswerRequired'),
                },
                {
                  max: MAX_ANSWER_LENGTH,
                  message: t('quizAnswerTooLong'),
                },
              ]}
            >
              <Input.TextArea
                aria-required="true"
                autoSize={{ minRows: 2, maxRows: 6 }}
                maxLength={MAX_ANSWER_LENGTH}
                placeholder={t('quizAnswerPlaceholder')}
                showCount
              />
            </Form.Item>
          ))}

          {showError ? (
            <Alert
              showIcon
              title={localError ?? failureMessage}
              type="error"
            />
          ) : null}

          {action.pending ? (
            <p className={styles.muted} role="status">
              {t('quizSubmitting')}
            </p>
          ) : null}

          <div className={styles.actions}>
            {submission ? (
              <Button
                htmlType="button"
                onClick={() => {
                  action.reset();
                  setSubmission(undefined);
                }}
              >
                {t('quizSubmitAgain')}
              </Button>
            ) : (
              <Button
                disabled={action.pending}
                htmlType="submit"
                loading={action.pending}
                type="primary"
              >
                {action.pending ? t('quizSubmitting') : t('quizSubmit')}
              </Button>
            )}
          </div>
        </Form>
      )}

      {submission ? <QuizSubmissionResult data={submission} /> : null}
    </section>
  );
}
