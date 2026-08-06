/**
 * Message-history compaction.
 *
 * Long agent loops accumulate a long LlmMessage[] history and eventually blow
 * past the model's context window. This module lets the AgentLoop shrink the
 * history before each LLM call by:
 *   1. keeping the head (system prompt + first user message),
 *   2. summarising the middle turns into a single synthetic system message,
 *   3. keeping the most recent ``keepTail`` messages verbatim.
 *
 * The summarise step uses the LLM provider; when the provider cannot be used
 * (e.g. tests, no network) a deterministic digest is produced instead so the
 * compaction flow is still observable.
 */

import type { LlmMessage, LlmProvider } from '../agent/agent-loop.js';

export interface CompactionOptions {
  /** Soft cap on total messages before compaction triggers. */
  maxMessages?: number;
  /** Soft cap on character budget across all message content. */
  maxChars?: number;
  /** How many of the most recent non-system messages to keep verbatim. */
  keepTail?: number;
  /**
   * When true (default), call the LLM provider to summarise the dropped
   * middle. When false, produce a deterministic digest of the dropped
   * messages instead.
   */
  useLlmSummariser?: boolean;
}

export interface CompactionResult {
  messages: LlmMessage[];
  compacted: boolean;
  /** How many middle messages were folded into the summary. */
  summarizedCount: number;
  /** How many tail messages were kept verbatim. */
  tailCount: number;
  /** Approximate byte/char size of the resulting history. */
  resultingChars: number;
  /** The summary text that was injected (or digest when no LLM). */
  summary: string;
  /** Whether the LLM provider was used vs the deterministic digest. */
  summariser: 'llm' | 'digest';
}

/** Count message content characters. Cheap heuristic; no tokenizer. */
export function estimateChars(messages: LlmMessage[]): number {
  let total = 0;
  for (const m of messages) {
    if (m.content) total += m.content.length;
    if (m.tool_calls) {
      for (const tc of m.tool_calls) {
        total += tc.name.length + 12 + JSON.stringify(tc.arguments).length;
      }
    }
  }
  return total;
}

/**
 * Whether the message history should be compacted right now.
 *
 * Two triggers: too many messages OR estimated character budget exceeded.
 * Defaults are conservative — they protect typical 8k-context models.
 */
export function shouldCompact(
  messages: LlmMessage[],
  options: CompactionOptions = {},
): boolean {
  const maxMessages = options.maxMessages ?? 30;
  const maxChars = options.maxChars ?? 50_000;
  if (messages.length > maxMessages) return true;
  if (estimateChars(messages) > maxChars) return true;
  return false;
}

/**
 * Build a deterministic digest of dropped messages so the compaction flow is
 * observable in tests / offline runs. Includes per-message role + a short
 * snippet of content so a human reviewing the history can still understand
 * what was summarised.
 */
export function digestMessages(messages: LlmMessage[]): string {
  return messages
    .map((m) => {
      const snippet = m.content.length > 80 ? `${m.content.slice(0, 80)}…` : m.content;
      return `[${m.role}] ${snippet}`;
    })
    .join(' | ');
}

const SUMMARISER_SYSTEM_PROMPT =
  'You are a conversation compactor. Produce a concise factual summary that ' +
  'preserves the user goal, key decisions, tool outputs, and any unresolved ' +
  'questions. Do not invent details. Respond with at most 6 short bullet points.';

function buildSummariserPrompt(dropped: LlmMessage[]): LlmMessage[] {
  const transcript = dropped
    .map((m) => `${m.role.toUpperCase()}: ${m.content}`)
    .join('\n');
  return [
    { role: 'system', content: SUMMARISER_SYSTEM_PROMPT },
    {
      role: 'user',
      content:
        'Summarise the following middle of an agent conversation in 6 bullet points:\n\n' +
        transcript,
    },
  ];
}

/**
 * Compact ``messages`` into a shorter version. When ``provider`` is supplied
 * and ``useLlmSummariser !== false``, the dropped middle is summarised via
 * a single LLM call; otherwise a deterministic digest is used.
 */
export async function compactMessages(
  messages: LlmMessage[],
  provider: LlmProvider | null,
  options: CompactionOptions = {},
): Promise<CompactionResult> {
  const keepTail = Math.max(1, options.keepTail ?? 8);

  if (messages.length === 0) {
    return {
      messages: [],
      compacted: false,
      summarizedCount: 0,
      tailCount: 0,
      resultingChars: 0,
      summary: '',
      summariser: 'digest',
    };
  }

  // Identify head (system prompt + first user message) and tail.
  const head: LlmMessage[] = [];
  for (const m of messages) {
    head.push(m);
    if (m.role === 'user') break;
  }

  // If history is already short enough, return as-is.
  const nonHeadTail = messages.slice(head.length);
  if (nonHeadTail.length <= keepTail) {
    return {
      messages: messages.slice(),
      compacted: false,
      summarizedCount: 0,
      tailCount: nonHeadTail.length,
      resultingChars: estimateChars(messages),
      summary: '',
      summariser: 'digest',
    };
  }

  const tail = messages.slice(messages.length - keepTail);
  const dropped = nonHeadTail.slice(0, nonHeadTail.length - keepTail);

  const useLlm = options.useLlmSummariser !== false && provider != null;
  let summaryText: string;
  let summariser: 'llm' | 'digest';
  if (useLlm && provider) {
    try {
      const response = await provider.complete(
        buildSummariserPrompt(dropped),
        [],
      );
      summaryText = (response.content || digestMessages(dropped)).trim();
      summariser = summaryText ? 'llm' : 'digest';
      if (!summaryText) summaryText = digestMessages(dropped);
    } catch {
      summaryText = digestMessages(dropped);
      summariser = 'digest';
    }
  } else {
    summaryText = digestMessages(dropped);
    summariser = 'digest';
  }

  const summaryMessage: LlmMessage = {
    role: 'system',
    content: `[compacted: ${dropped.length} earlier turns] ${summaryText}`,
  };

  const next: LlmMessage[] = [...head, summaryMessage, ...tail];
  return {
    messages: next,
    compacted: true,
    summarizedCount: dropped.length,
    tailCount: tail.length,
    resultingChars: estimateChars(next),
    summary: summaryText,
    summariser,
  };
}
