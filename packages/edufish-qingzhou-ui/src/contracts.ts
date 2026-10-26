import type { ComponentType, ReactNode } from 'react';
import type {
  EduFishInvocation, EduFishOperationName, EduFishOperationInput,
  EduFishOperationOutput, EduFishPluginError, QuizReadOutput,
  QuizSubmitOutput, LabStartOutput,
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
}

export interface EduFishUIProviderProps {
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

export interface ResultProps<T> {
  data: T;
  className?: string;
  onOpenReference?: (reference: EduFishReference) => void;
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
  onStarted?: (result: LabStartOutput) => void;
}
