import type { GraphNeighborhoodOutput, GraphSourceReference } from '@edufish/plugin';
import { act, cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import i18n from 'i18next';
import { StrictMode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { GraphResult } from '../src/components/GraphResult.js';
import type { EduFishUIClient } from '../src/contracts.js';
import { EduFishUIProvider } from '../src/provider.js';
import { EduFishRenders, parseEduFishSnapshot } from '../src/registry.js';

const source: GraphSourceReference = {
  course_id: 'course-biology',
  material_id: 'material-cells',
  chunk_id: 'chunk-cells',
  filename: 'cells.pdf',
  page_number: 3,
  citation_locator: 'cells.pdf#page-3-chunk-1',
  content_sha256: 'a'.repeat(64),
};

const edgeSource: GraphSourceReference = {
  ...source,
  material_id: 'material-plants',
  chunk_id: 'chunk-plants',
  filename: 'plants.pdf',
  page_number: 7,
  citation_locator: 'plants.pdf#page-7-chunk-2',
  content_sha256: 'b'.repeat(64),
};

const graph: GraphNeighborhoodOutput = {
  nodes: [
    { id: 'photosynthesis', label: 'Photosynthesis', definition: 'Plants turn light into energy.' },
    { id: 'chlorophyll', label: 'Chlorophyll', definition: 'A pigment that absorbs light.' },
  ],
  edges: [
    {
      id: 'uses-pigment',
      source_id: 'photosynthesis',
      target_id: 'chlorophyll',
      relationship: 'uses',
      evidence: 'The pigment absorbs light used by the plant.',
    },
  ],
  context: {
    version: 1,
    course_id: 'course-biology',
    snapshot_id: 'c'.repeat(64),
    concepts: [
      {
        concept_id: 'photosynthesis',
        sources: [source],
        activities: [
          { activity_id: 'activity-reading', chapter_id: 'chapter-plants', title: 'Plant reading', activity_type: 'reading' },
        ],
        experiments: [
          { template_id: 'template-plant', title: 'Light experiment', adapter: 'plant-model' },
        ],
      },
      { concept_id: 'chlorophyll', sources: [], activities: [], experiments: [] },
    ],
    edges: [{ edge_id: 'uses-pigment', sources: [edgeSource] }],
  },
};

const origin = { messageId: 'host-message', toolCallId: 'host-tool-call' };
const selectedContext = {
  course_id: 'course-biology',
  concept_id: 'photosynthesis',
  label: 'Photosynthesis',
  graph_snapshot_id: graph.context!.snapshot_id,
  origin,
};

function createHost() {
  const callbacks = {
    onOpenReference: vi.fn(),
    onFocusConcept: vi.fn(),
    onAskConcept: vi.fn(),
    onOpenActivity: vi.fn(),
    onOpenExperiment: vi.fn(),
  };
  const invoke = vi.fn<EduFishUIClient['invoke']>();
  const getInvocation = vi.fn(() => ({
    scope: { userId: 'trusted-user', sessionId: 'trusted-session' },
  }));
  const Renderer = EduFishRenders['graph.neighborhood'];

  const renderGraph = (data = graph) => (
    <EduFishUIProvider
      client={{ invoke }}
      getInvocation={getInvocation}
      identityKey="trusted-user"
      {...callbacks}
    >
      <Renderer
        apiName="edufish.graph.neighborhood"
        args={{
          course_id: 'argument-course',
          user_id: 'argument-user',
          session_id: 'argument-session',
          messageId: 'argument-message',
        }}
        content={null}
        messageId={origin.messageId}
        pluginState={data}
        toolCallId={origin.toolCallId}
      />
    </EduFishUIProvider>
  );

  return { callbacks, invoke, getInvocation, renderGraph };
}

afterEach(async () => {
  cleanup();
  vi.unstubAllGlobals();
  await i18n.changeLanguage('en-US');
});

describe('graph host actions', () => {
  it('parses and freezes extended snapshots while retaining legacy snapshots', () => {
    const snapshot = parseEduFishSnapshot('graph.neighborhood', graph, undefined);
    expect(snapshot.status).toBe('ready');
    if (snapshot.status === 'ready') {
      const data = snapshot.data as GraphNeighborhoodOutput;
      expect(data.context).toEqual(graph.context);
      expect(Object.isFrozen(data.context!.concepts[0].sources[0])).toBe(true);
    }
    expect(parseEduFishSnapshot('graph.neighborhood', {
      nodes: graph.nodes,
      edges: graph.edges,
    }, undefined).status).toBe('ready');
  });

  it('performs no host action or request on StrictMode mount, replay or locale change', async () => {
    const host = createHost();
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    const { rerender } = render(<StrictMode>{host.renderGraph()}</StrictMode>);

    rerender(<StrictMode>{host.renderGraph({
      ...graph,
      context: { ...graph.context!, snapshot_id: 'd'.repeat(64) },
    })}</StrictMode>);
    await act(async () => { await i18n.changeLanguage('zh-CN'); });

    expect(screen.getByRole('button', { name: '围绕此概念继续提问' })).toBeTruthy();
    for (const callback of Object.values(host.callbacks)) {
      expect(callback).not.toHaveBeenCalled();
    }
    expect(host.invoke).not.toHaveBeenCalled();
    expect(host.getInvocation).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(document.querySelectorAll('a[href]')).toHaveLength(0);
  });

  it('sends explicit concept selection and questions with snapshot context and host origin', async () => {
    const user = userEvent.setup();
    const host = createHost();
    render(host.renderGraph());
    expect(host.callbacks.onFocusConcept).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Chlorophyll' }));
    const context = { ...selectedContext, concept_id: 'chlorophyll', label: 'Chlorophyll' };
    expect(host.callbacks.onFocusConcept).toHaveBeenCalledWith(context);
    await user.click(screen.getByRole('button', { name: 'Ask about this concept' }));
    expect(host.callbacks.onAskConcept).toHaveBeenCalledWith(context);
    expect(screen.getByText('No source references available.')).toBeTruthy();
    expect(host.invoke).not.toHaveBeenCalled();
    expect(host.getInvocation).not.toHaveBeenCalled();
  });

  it('supports keyboard concept selection and an explicit question action', async () => {
    const user = userEvent.setup();
    const host = createHost();
    render(host.renderGraph());

    await user.tab();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Photosynthesis' }));
    await user.tab();
    await user.keyboard('{Enter}');
    const context = { ...selectedContext, concept_id: 'chlorophyll', label: 'Chlorophyll' };
    expect(host.callbacks.onFocusConcept).toHaveBeenCalledTimes(1);
    expect(host.callbacks.onFocusConcept).toHaveBeenCalledWith(context);
    await user.tab();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Ask about this concept' }));
    await user.keyboard('{Enter}');
    expect(host.callbacks.onAskConcept).toHaveBeenCalledTimes(1);
    expect(host.callbacks.onAskConcept).toHaveBeenCalledWith(context);
    expect(host.invoke).not.toHaveBeenCalled();
  });

  it('opens concept and relationship sources through the host with their content hashes', async () => {
    const user = userEvent.setup();
    const host = createHost();
    render(host.renderGraph());

    await user.click(screen.getByRole('button', {
      name: 'Open the cited source in a new view: cells.pdf, Page 3',
    }));
    expect(host.callbacks.onOpenReference).toHaveBeenNthCalledWith(1, source);
    await user.click(screen.getByRole('button', {
      name: 'Open the cited source in a new view: plants.pdf, Page 7',
    }));
    expect(host.callbacks.onOpenReference).toHaveBeenNthCalledWith(2, edgeSource);
    expect(host.invoke).not.toHaveBeenCalled();
    expect(document.querySelectorAll('a[href]')).toHaveLength(0);
  });

  it('opens related activities and experiment views without starting a run', async () => {
    const user = userEvent.setup();
    const host = createHost();
    render(host.renderGraph());

    await user.click(screen.getByRole('button', { name: 'Open activity: Plant reading' }));
    expect(host.callbacks.onOpenActivity).toHaveBeenCalledWith({
      ...selectedContext,
      activity: graph.context!.concepts[0].activities[0],
    });
    await user.click(screen.getByRole('button', { name: 'Open experiment: Light experiment' }));
    expect(host.callbacks.onOpenExperiment).toHaveBeenCalledWith({
      ...selectedContext,
      experiment: graph.context!.concepts[0].experiments[0],
    });
    expect(host.invoke).not.toHaveBeenCalled();
    expect(host.getInvocation).not.toHaveBeenCalled();
  });

  it('keeps sources readable and hides host controls without callbacks', () => {
    render(<GraphResult data={graph} />);

    expect(screen.getByText('cells.pdf · Page 3')).toBeTruthy();
    expect(screen.getByText('plants.pdf · Page 7')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Ask about|Open activity|Open experiment|Open the cited source/ })).toBeNull();
  });

  it('keeps legacy results locally selectable without creating course navigation context', async () => {
    const user = userEvent.setup();
    const host = createHost();
    render(host.renderGraph({ nodes: graph.nodes, edges: graph.edges }));

    await user.click(screen.getByRole('button', { name: 'Chlorophyll' }));
    expect(screen.getByText('A pigment that absorbs light.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Ask about|Open activity|Open experiment|Open the cited source/ })).toBeNull();
    for (const callback of Object.values(host.callbacks)) {
      expect(callback).not.toHaveBeenCalled();
    }
    expect(host.invoke).not.toHaveBeenCalled();
  });

  it('resolves a stale selection within the new snapshot without emitting an automatic focus', async () => {
    const user = userEvent.setup();
    const onFocusConcept = vi.fn();
    const onAskConcept = vi.fn();
    const { rerender } = render(
      <GraphResult data={graph} onFocusConcept={onFocusConcept} onAskConcept={onAskConcept} />,
    );
    await user.click(screen.getByRole('button', { name: 'Chlorophyll' }));

    const next: GraphNeighborhoodOutput = {
      nodes: [{ id: 'respiration', label: 'Respiration', definition: 'Cells release energy.' }],
      edges: [],
      context: {
        version: 1,
        course_id: 'course-next',
        snapshot_id: 'e'.repeat(64),
        concepts: [{ concept_id: 'respiration', sources: [], activities: [], experiments: [] }],
        edges: [],
      },
    };
    rerender(<GraphResult data={next} onFocusConcept={onFocusConcept} onAskConcept={onAskConcept} />);

    expect(screen.getByRole('button', { name: 'Respiration' }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.queryByText('A pigment that absorbs light.')).toBeNull();
    expect(onFocusConcept).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole('button', { name: 'Ask about this concept' }));
    expect(onAskConcept).toHaveBeenCalledWith({
      course_id: 'course-next',
      concept_id: 'respiration',
      label: 'Respiration',
      graph_snapshot_id: 'e'.repeat(64),
    });
  });

  it('rejects context entries outside the displayed graph before exposing host actions', () => {
    const host = createHost();
    const invalid: GraphNeighborhoodOutput = {
      ...graph,
      context: {
        ...graph.context!,
        concepts: [
          ...graph.context!.concepts,
          {
            concept_id: 'outside-graph',
            sources: [{ ...source, filename: 'hidden-source-name' }],
            activities: [],
            experiments: [],
          },
        ],
      },
    };
    render(host.renderGraph(invalid));

    expect(screen.getByText('This result could not be displayed.')).toBeTruthy();
    expect(document.body.textContent).not.toContain('hidden-source-name');
    expect(screen.queryByRole('button')).toBeNull();
    for (const callback of Object.values(host.callbacks)) {
      expect(callback).not.toHaveBeenCalled();
    }
  });
});
