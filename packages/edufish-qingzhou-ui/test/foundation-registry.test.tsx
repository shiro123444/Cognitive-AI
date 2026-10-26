import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { EduFishUIClient } from '../src/contracts.js';
import { edufishUIResources } from '../src/i18n.js';
import { EduFishUIProvider } from '../src/provider.js';
import {
  EduFishInspectors,
  EduFishRenders,
  EduFishStreaming,
  EduFishToolResult,
  normalizeEduFishOperation,
  parseEduFishSnapshot,
} from '../src/registry.js';

const courseOutput = {
  course: {
    id: 'course-1',
    title: 'Algorithms',
    summary: 'An introduction to algorithms.',
    status: 'active',
  },
  chapters: [
    {
      id: 'chapter-1',
      title: 'Sorting',
      order: 1,
      objectives: 'Understand comparison sorts.',
    },
  ],
};

const quizOutput = {
  items: [{ id: 'quiz-1', prompt: 'What is 2 + 2?' }],
};

const SHORT_OPERATIONS = [
  'course.read',
  'material.search',
  'graph.neighborhood',
  'quiz.read',
  'quiz.submit',
  'progress.read',
  'lab.start',
  'lab.status',
];

describe('normalizeEduFishOperation', () => {
  it('normalises full and short names', () => {
    expect(normalizeEduFishOperation('edufish.course.read')).toBe('course.read');
    expect(normalizeEduFishOperation('course.read')).toBe('course.read');
    expect(normalizeEduFishOperation(' edufish.quiz.submit ')).toBe(
      'quiz.submit',
    );
    expect(normalizeEduFishOperation('lab.status')).toBe('lab.status');
  });

  it('rejects unknown and non-string names', () => {
    expect(normalizeEduFishOperation('edufish.quiz.delete')).toBeUndefined();
    expect(normalizeEduFishOperation('')).toBeUndefined();
    expect(normalizeEduFishOperation(undefined)).toBeUndefined();
    expect(normalizeEduFishOperation(42)).toBeUndefined();
  });
});

describe('parseEduFishSnapshot', () => {
  it('validates pluginState against the strict core schema and freezes it', () => {
    const snapshot = parseEduFishSnapshot(
      'course.read',
      courseOutput,
      undefined,
    );
    expect(snapshot.status).toBe('ready');
    if (snapshot.status === 'ready') {
      expect(snapshot.data).toEqual(courseOutput);
      expect(Object.isFrozen(snapshot.data)).toBe(true);
      expect(
        Object.isFrozen((snapshot.data as typeof courseOutput).chapters),
      ).toBe(true);
    }
  });

  it('falls back to content JSON when pluginState is absent', () => {
    const snapshot = parseEduFishSnapshot(
      'edufish.course.read',
      undefined,
      JSON.stringify(courseOutput),
    );
    expect(snapshot.status).toBe('ready');
  });

  it('unwraps a strict success envelope', () => {
    const snapshot = parseEduFishSnapshot('course.read', {
      success: true,
      data: courseOutput,
    });
    expect(snapshot.status).toBe('ready');
    if (snapshot.status === 'ready') {
      expect(snapshot.data).toEqual(courseOutput);
    }
  });

  it('classifies an error envelope without exposing its message', () => {
    const snapshot = parseEduFishSnapshot('course.read', {
      success: false,
      error: { code: 'UNAVAILABLE', message: 'internal secret detail' },
    });
    expect(snapshot).toEqual({ status: 'error' });
    expect(JSON.stringify(snapshot)).not.toContain('internal secret detail');
  });

  it('rejects malformed JSON, malformed envelopes and strict-schema leaks', () => {
    expect(parseEduFishSnapshot('course.read', '{"course":', null)).toEqual({
      status: 'invalid',
    });
    expect(
      parseEduFishSnapshot('course.read', {
        success: true,
        data: courseOutput,
        extra: true,
      }),
    ).toEqual({ status: 'invalid' });
    expect(
      parseEduFishSnapshot('course.read', {
        ...courseOutput,
        leaked: 'answer',
      }),
    ).toEqual({ status: 'invalid' });
    expect(
      parseEduFishSnapshot('course.read', {
        success: false,
        error: { code: 'UNAVAILABLE' },
      }),
    ).toEqual({ status: 'invalid' });
  });

  it('reports empty and unknown operations distinctly', () => {
    expect(parseEduFishSnapshot('course.read', undefined, null)).toEqual({
      status: 'empty',
    });
    expect(parseEduFishSnapshot('unknown.operation', courseOutput)).toEqual({
      status: 'invalid',
    });
  });
});

describe('registry maps', () => {
  it('expose exactly the eight short operation names and are immutable', () => {
    expect(Object.keys(EduFishRenders).sort()).toEqual(
      [...SHORT_OPERATIONS].sort(),
    );
    expect(Object.keys(EduFishInspectors).sort()).toEqual(
      [...SHORT_OPERATIONS].sort(),
    );
    expect(Object.keys(EduFishStreaming).sort()).toEqual(
      [...SHORT_OPERATIONS].sort(),
    );
    expect(Object.isFrozen(EduFishRenders)).toBe(true);
    expect(Object.isFrozen(EduFishInspectors)).toBe(true);
    expect(Object.isFrozen(EduFishStreaming)).toBe(true);
  });

  it('shows a generic invalid state and never echoes raw payloads', () => {
    const secret = 'raw-secret-answer';
    const CourseRenderer = EduFishRenders['course.read'];

    const { container } = render(
      <CourseRenderer
        apiName="edufish.course.read"
        args={{ secret }}
        content={null}
        messageId="message-1"
        pluginState={{ ...courseOutput, leaked: secret }}
      />,
    );

    expect(
      screen.getByText('This result could not be displayed.'),
    ).toBeTruthy();
    expect(screen.queryByText(secret)).toBeNull();
    expect(container.textContent).not.toContain(secret);
  });

  it('shows a generic error state for pluginError', () => {
    const secret = 'transport-secret';
    const CourseRenderer = EduFishRenders['course.read'];

    render(
      <CourseRenderer
        args={{ secret }}
        content={null}
        messageId="message-2"
        pluginError={{ message: secret, stack: secret }}
      />,
    );

    expect(screen.getByText('This operation did not complete.')).toBeTruthy();
    expect(screen.queryByText(secret)).toBeNull();
  });

  it('renders valid content through the real result component', () => {
    const CourseRenderer = EduFishRenders['course.read'];

    const { container } = render(
      <CourseRenderer
        args={{ course_id: 'course-1' }}
        content={JSON.stringify(courseOutput)}
        messageId="message-3"
      />,
    );

    expect(
      screen.queryByText('This result could not be displayed.'),
    ).toBeNull();
    expect(container.textContent?.length).toBeGreaterThan(0);
  });

  it('never calls the client while rendering a snapshot', () => {
    const invoke = vi.fn<EduFishUIClient['invoke']>();
    const CourseRenderer = EduFishRenders['course.read'];

    render(
      <EduFishUIProvider
        client={{ invoke }}
        identityKey="user-a"
        getInvocation={() => ({
          scope: { userId: 'user-a', sessionId: 'session-1' },
        })}
      >
        <CourseRenderer
          apiName="edufish.course.read"
          identifier="edufish.course.read"
          args={{}}
          content={null}
          messageId="message-render"
          pluginState={courseOutput}
        />
      </EduFishUIProvider>,
    );

    expect(invoke).not.toHaveBeenCalled();
  });

  it('routes EduFishToolResult and rejects unknown identifiers', () => {
    const { container: validContainer } = render(
      <EduFishToolResult
        apiName="edufish.course.read"
        identifier="edufish.course.read"
        args={{}}
        content={courseOutput}
        messageId="message-4"
      />,
    );
    expect(
      screen.queryByText('This result could not be displayed.'),
    ).toBeNull();
    expect(validContainer.textContent?.length).toBeGreaterThan(0);

    render(
      <EduFishToolResult
        apiName="edufish.unknown"
        identifier="unknown"
        args={{}}
        content={null}
        messageId="message-5"
      />,
    );
    expect(
      screen.getAllByText('This result could not be displayed.').length,
    ).toBeGreaterThan(0);
  });
});

describe('inspectors and streaming', () => {
  it('inspector shows status without args or payload content', () => {
    const secret = 'inspector-secret';
    const Inspector = EduFishInspectors['quiz.read'];

    render(
      <Inspector
        apiName="edufish.quiz.read"
        identifier="edufish.quiz.read"
        args={{ secret }}
        partialArgs={{ secret }}
        pluginState={quizOutput}
        result={{ content: null }}
      />,
    );

    expect(screen.getByText('Snapshot verified')).toBeTruthy();
    expect(screen.queryByText(secret)).toBeNull();
    expect(screen.queryByText('What is 2 + 2?')).toBeNull();
  });

  it('inspector shows generic loading, invalid and error states', () => {
    const Inspector = EduFishInspectors['course.read'];

    const { rerender } = render(
      <Inspector
        apiName="edufish.course.read"
        identifier="edufish.course.read"
        args={{}}
        isLoading
        result={{ content: null }}
      />,
    );
    expect(screen.getByText('Reading EduFish result…')).toBeTruthy();

    rerender(
      <Inspector
        apiName="edufish.course.read"
        identifier="edufish.course.read"
        args={{}}
        result={{ content: 'not-json', error: { secret: 'x' } }}
      />,
    );
    expect(screen.getByText('Operation failed')).toBeTruthy();

    rerender(
      <Inspector
        apiName="edufish.course.read"
        identifier="edufish.course.read"
        args={{}}
        result={{ content: 'not-json' }}
      />,
    );
    expect(
      screen.getByText('This result could not be displayed.'),
    ).toBeTruthy();
  });

  it('streaming shows a host loading state without args', () => {
    const Streaming = EduFishStreaming['graph.neighborhood'];
    const secret = 'stream-secret';

    render(
      <Streaming
        apiName="edufish.graph.neighborhood"
        args={{ secret }}
        identifier="edufish.graph.neighborhood"
        messageId="message-6"
        toolCallId="tool-1"
      />,
    );

    expect(screen.getByText('Waiting for EduFish…')).toBeTruthy();
    expect(screen.queryByText(secret)).toBeNull();
  });
});

describe('i18n resources', () => {
  function flattenLeaves(
    value: Record<string, unknown>,
    prefix = '',
  ): Record<string, string> {
    const leaves: Record<string, string> = {};
    for (const [key, entry] of Object.entries(value)) {
      const path = prefix.length === 0 ? key : `${prefix}.${key}`;
      if (typeof entry === 'string') {
        leaves[path] = entry;
      } else if (typeof entry === 'object' && entry !== null) {
        Object.assign(
          leaves,
          flattenLeaves(entry as Record<string, unknown>, path),
        );
      }
    }
    return leaves;
  }

  it('provide the same non-empty keys in Chinese and English', () => {
    const en = flattenLeaves(
      edufishUIResources['en-US'].edufish as Record<string, unknown>,
    );
    const zh = flattenLeaves(
      edufishUIResources['zh-CN'].edufish as Record<string, unknown>,
    );

    expect(Object.keys(zh).sort()).toEqual(Object.keys(en).sort());
    for (const key of Object.keys(en)) {
      expect(en[key]?.length ?? 0).toBeGreaterThan(0);
      expect(zh[key]?.length ?? 0).toBeGreaterThan(0);
    }
  });

  it('include the flat keys used by result components', () => {
    const en = flattenLeaves(
      edufishUIResources['en-US'].edufish as Record<string, unknown>,
    );
    const zh = flattenLeaves(
      edufishUIResources['zh-CN'].edufish as Record<string, unknown>,
    );

    for (const key of [
      'courseTitle',
      'courseNoChapters',
      'materialRetrievalKeyword',
      'graphTruncatedDiagram',
      'quizSubmitAgain',
      'progressMoreSubmissions',
      'labLauncherDescription',
      'a11yLabLauncher',
    ]) {
      expect(en[key]).toBeTruthy();
      expect(zh[key]).toBeTruthy();
    }
    expect(zh['courseTitle']).toBe('课程');
    expect(zh['quizSubmit']).toBe('提交答案');
  });
});
