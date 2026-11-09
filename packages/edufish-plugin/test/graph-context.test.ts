import { describe, expect, it, vi } from 'vitest';

import {
  createEduFishPlugin,
  EDUFISH_MANIFEST,
  EDUFISH_OPERATION,
  GraphNeighborhoodInputSchema,
  GraphNeighborhoodOutputSchema,
  type GraphContext,
  type GraphNeighborhoodOutput,
} from '../src/index.js';
import { expectPluginError, makeInvocation } from './helpers.js';

const legacyGraph = {
  nodes: [
    { id: 'concept-a', label: 'Neuron', definition: 'An excitable cell.' },
    { id: 'concept-b', label: 'Spike', definition: 'An action potential.' },
  ],
  edges: [{
    id: 'edge-ab',
    source_id: 'concept-a',
    target_id: 'concept-b',
    relationship: 'produces',
    evidence: 'Reviewed material.',
  }],
};

function enrichedGraph(): GraphNeighborhoodOutput & { context: GraphContext } {
  return {
    ...structuredClone(legacyGraph),
    context: {
      version: 1,
      course_id: 'course-1',
      snapshot_id: 'a'.repeat(64),
      concepts: legacyGraph.nodes.map((node) => ({
        concept_id: node.id,
        sources: node.id === 'concept-a' ? [{
          course_id: 'course-1',
          material_id: 'material-1',
          chunk_id: 'chunk-1',
          filename: 'neurons.pdf',
          page_number: 4,
          citation_locator: 'p.4',
          content_sha256: 'b'.repeat(64),
        }] : [],
        activities: [],
        experiments: [],
      })),
      edges: [{ edge_id: 'edge-ab', sources: [] }],
    },
  };
}

const graphOperation = EDUFISH_OPERATION.graphNeighborhood;

describe('opt-in graph context', () => {
  it('advertises the optional context capability in discovery', () => {
    const operation = EDUFISH_MANIFEST.operations.find((entry) => entry.name === graphOperation);
    expect(operation?.input_schema).toMatchObject({
      properties: { include_context: { type: 'boolean', default: false } },
    });
    expect(operation?.discovery.arguments).toContainEqual(expect.objectContaining({
      name: 'include_context', type: 'boolean', required: false,
    }));
  });

  it('keeps the flag absent on legacy calls so older v1 servers still accept them', async () => {
    const invoke = vi.fn(async (_operation: string, _args: Readonly<Record<string, unknown>>) => legacyGraph);
    const plugin = createEduFishPlugin({ transport: { invoke } });
    const output = await plugin.invoke(graphOperation, { course_id: 'course-1' }, makeInvocation());
    expect(output).toEqual(legacyGraph);
    expect(invoke.mock.calls[0]?.[1]).not.toHaveProperty('include_context');
    expect(GraphNeighborhoodOutputSchema.parse(legacyGraph)).toEqual(legacyGraph);
  });

  it('transports explicit context requests and validates their result', async () => {
    const graph = enrichedGraph();
    const invoke = vi.fn(async (_operation: string, _args: Readonly<Record<string, unknown>>) => graph);
    const plugin = createEduFishPlugin({ transport: { invoke } });
    expect(await plugin.invoke(
      graphOperation,
      { course_id: 'course-1', include_context: true },
      makeInvocation(),
    )).toEqual(graph);
    expect(invoke.mock.calls[0]?.[1]).toHaveProperty('include_context', true);
  });

  it.each([null, 'true', 1, {}, []])('rejects a non-boolean opt-in value %j', (include_context) => {
    expect(GraphNeighborhoodInputSchema.safeParse({ course_id: 'course-1', include_context }).success).toBe(false);
  });

  it.each([
    { label: 'missing context', output: legacyGraph, args: { include_context: true } },
    { label: 'unsolicited context', output: enrichedGraph(), args: {} },
    { label: 'explicitly disabled context', output: enrichedGraph(), args: { include_context: false } },
    { label: 'another course', output: enrichedGraph(), args: { course_id: 'course-2', include_context: true } },
  ])('rejects $label at the invocation boundary', async ({ output, args }) => {
    const plugin = createEduFishPlugin({ transport: { invoke: async () => output } });
    await expectPluginError(plugin.invoke(
      graphOperation,
      { course_id: 'course-1', ...args },
      makeInvocation(),
    ), 'INVALID_OUTPUT');
  });

  it('rejects cross-course sources and unknown host resource fields', () => {
    const graph = enrichedGraph();
    graph.context.concepts[0]!.sources[0]!.course_id = 'private-course';
    expect(GraphNeighborhoodOutputSchema.safeParse(graph).success).toBe(false);
    const badSource = enrichedGraph();
    Object.assign(badSource.context.concepts[0]!.sources[0]!, { fileId: 'invented-host-id' });
    expect(GraphNeighborhoodOutputSchema.safeParse(badSource).success).toBe(false);
  });

  it('rejects orphan, duplicate or incomplete concept context', () => {
    const orphan = enrichedGraph();
    orphan.context.concepts[0]!.concept_id = 'hidden-concept';
    expect(GraphNeighborhoodOutputSchema.safeParse(orphan).success).toBe(false);
    const duplicate = enrichedGraph();
    duplicate.context.concepts[1]!.concept_id = 'concept-a';
    expect(GraphNeighborhoodOutputSchema.safeParse(duplicate).success).toBe(false);
    const incomplete = enrichedGraph();
    incomplete.context.concepts.pop();
    expect(GraphNeighborhoodOutputSchema.safeParse(incomplete).success).toBe(false);
  });

  it('rejects mismatched edges, hidden endpoints and repeated source chunks', () => {
    const graph = enrichedGraph();
    graph.context.edges[0]!.edge_id = 'hidden-edge';
    expect(GraphNeighborhoodOutputSchema.safeParse(graph).success).toBe(false);
    const endpoint = enrichedGraph();
    endpoint.edges[0]!.source_id = 'hidden-node';
    expect(GraphNeighborhoodOutputSchema.safeParse(endpoint).success).toBe(false);
    const repeated = enrichedGraph();
    repeated.context.concepts[0]!.sources.push(repeated.context.concepts[0]!.sources[0]!);
    expect(GraphNeighborhoodOutputSchema.safeParse(repeated).success).toBe(false);
  });

  it('bounds new sources and related activity references', () => {
    const graph = enrichedGraph();
    graph.context.concepts[0]!.activities = Array.from({ length: 21 }, (_, index) => ({
      activity_id: `activity-${index}`, chapter_id: null, title: 'Read', activity_type: 'reading',
    }));
    expect(GraphNeighborhoodOutputSchema.safeParse(graph).success).toBe(false);
    const unversioned = enrichedGraph();
    unversioned.context.snapshot_id = 'not-a-content-hash';
    expect(GraphNeighborhoodOutputSchema.safeParse(unversioned).success).toBe(false);
  });
});
