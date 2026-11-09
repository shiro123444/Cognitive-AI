import type { ComponentType, ReactNode } from 'react';
import type {
  EduFishInvocation, EduFishOperationName, EduFishOperationInput,
  EduFishOperationOutput, EduFishPluginError, GraphActivityReference,
  GraphExperimentReference, QuizReadOutput, QuizSubmitOutput, LabStartOutput,
  LabLearningContextInput,
} from '@edufish/plugin';

export const EDUFISH_UI_NAMESPACE = 'edufish';

export interface EduFishUIClient {
  invoke(operation: string, input: unknown, invocation: EduFishInvocation): Promise<unknown>;
}

export interface EduFishReference {
  course_id: string;
  material_id: string;
  chunk_id: string;
  filename: string;
  page_number: number;
  citation_locator: string;
  content_sha256?: string;
}

/** Message origin comes from the host render props, never operation arguments. */
export interface EduFishHostActionOrigin {
  messageId: string;
  toolCallId?: string;
}

/** Course business context; trusted user/session identity stays in invocation scope. */
export interface EduFishConceptContext {
  course_id: string;
  concept_id: string;
  label: string;
  graph_snapshot_id: string;
  origin?: EduFishHostActionOrigin;
}

export interface EduFishActivityContext extends EduFishConceptContext {
  activity: GraphActivityReference;
}

export interface EduFishExperimentContext extends EduFishConceptContext {
  experiment: GraphExperimentReference;
}

/** Navigation and conversation intents handled by the host after an explicit click. */
export interface EduFishGraphHostActions {
  onFocusConcept?: (context: EduFishConceptContext) => void;
  onAskConcept?: (context: EduFishConceptContext) => void;
  onOpenActivity?: (context: EduFishActivityContext) => void;
  onOpenExperiment?: (context: EduFishExperimentContext) => void;
}

export interface EduFishUIProviderProps extends EduFishGraphHostActions {
  client: EduFishUIClient;
  getInvocation: () => EduFishInvocation;
  identityKey: string;
  createRequestId?: () => string;
  onOpenReference?: (reference: EduFishReference) => void;
  children?: ReactNode;
}

export interface EduFishActionState<O extends EduFishOperationName> {
  run(input: EduFishOperationInput<O>): Promise<EduFishOperationOutput<O> | undefined>;
  data: EduFishOperationOutput<O> | undefined;
  pending: boolean;
  error: EduFishPluginError | undefined;
  requestId: string | undefined;
  cancel(): void;
  reset(): void;
}

export interface ResultProps<T> extends EduFishGraphHostActions {
  data: T;
  className?: string;
  onOpenReference?: (reference: EduFishReference) => void;
  origin?: EduFishHostActionOrigin;
}

/** Structural subset of Qingzhou's internal BuiltinRenderProps. */
export interface EduFishToolRenderProps {
  apiName?: string;
  args: unknown;
  content: unknown;
  identifier?: string;
  messageId: string;
  pluginError?: unknown;
  pluginState?: unknown;
  toolCallId?: string;
}

export interface EduFishToolInspectorProps {
  apiName: string;
  args: unknown;
  identifier: string;
  isArgumentsStreaming?: boolean;
  isLoading?: boolean;
  partialArgs?: unknown;
  pluginState?: unknown;
  result?: {content: string | null; error?: unknown};
}

export interface EduFishToolStreamingProps {
  apiName: string;
  args: unknown;
  identifier: string;
  messageId: string;
  toolCallId: string;
}

export type EduFishShortOperation =
  | 'course.read' | 'material.search' | 'graph.neighborhood' | 'quiz.read'
  | 'quiz.submit' | 'progress.read' | 'lab.start' | 'lab.status';

export type EduFishRenderMap = Record<EduFishShortOperation, ComponentType<EduFishToolRenderProps>>;
export type EduFishInspectorMap = Record<EduFishShortOperation, ComponentType<EduFishToolInspectorProps>>;
export type EduFishStreamingMap = Record<EduFishShortOperation, ComponentType<EduFishToolStreamingProps>>;

export interface QuizInteractionProps {
  courseId: string;
  chapterId: string;
  items: QuizReadOutput['items'];
  onSubmitted?: (result: QuizSubmitOutput) => void;
}

export interface LabLauncherProps {
  courseId: string;
  templateId: string;
  params?: Record<string, unknown>;
  learningContext?: LabLearningContextInput;
  onStarted?: (result: LabStartOutput) => void;
}
