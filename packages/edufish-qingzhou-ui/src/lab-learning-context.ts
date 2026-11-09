import type { LabLearningContextInput } from '@edufish/plugin';

import type {
  EduFishActivityContext,
  EduFishConceptContext,
} from './contracts.js';

/** Keep graph business references separate from host identity and run inputs. */
export function createLabLearningContext(
  context: EduFishConceptContext | EduFishActivityContext,
): LabLearningContextInput {
  return {
    concept_id: context.concept_id,
    graph_snapshot_id: context.graph_snapshot_id,
    ...('activity' in context
      ? {
          activity_id: context.activity.activity_id,
          ...(context.activity.chapter_id === null
            ? {}
            : { chapter_id: context.activity.chapter_id }),
        }
      : {}),
  };
}
