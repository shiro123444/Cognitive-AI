import type { GraphNeighborhoodOutput, GraphSourceReference } from '@edufish/plugin';
import { Block, Text } from '@lobehub/ui';
import { Button as AntButton } from 'antd';
import { useId, useRef, useState } from 'react';

import type { EduFishConceptContext, EduFishReference, ResultProps } from '../contracts.js';
import {
  EmptyState,
  mergeClassNames,
  truncateText,
  useEduFishTranslation,
} from './shared.js';
import { styles } from './styles.js';

const MAX_DIAGRAM_NODES = 40;
const MAX_DIAGRAM_EDGES = 160;
const MAX_INCIDENT_EDGES = 100;
const MAX_EVIDENCE_CHARS = 400;

const VIEWBOX_WIDTH = 480;
const VIEWBOX_HEIGHT = 300;
const CENTER_X = VIEWBOX_WIDTH / 2;
const CENTER_Y = 140;
const RADIUS = 105;

interface PositionedNode {
  id: string;
  label: string;
  x: number;
  y: number;
}

/** Deterministic circular layout; the first node sits at the top. */
function layoutNodes(
  nodes: GraphNeighborhoodOutput['nodes'],
): PositionedNode[] {
  if (nodes.length === 0) return [];
  if (nodes.length === 1) {
    return [
      {
        id: nodes[0].id,
        label: nodes[0].label,
        x: CENTER_X,
        y: CENTER_Y,
      },
    ];
  }

  return nodes.map((node, index) => {
    const angle = -Math.PI / 2 + (2 * Math.PI * index) / nodes.length;
    return {
      id: node.id,
      label: node.label,
      x: CENTER_X + RADIUS * Math.cos(angle),
      y: CENTER_Y + RADIUS * Math.sin(angle),
    };
  });
}

function GraphSources({
  sources,
  onOpenReference,
}: {
  sources: readonly GraphSourceReference[];
  onOpenReference?: (reference: EduFishReference) => void;
}) {
  const t = useEduFishTranslation();

  return (
    <ul aria-label={t('graphSources')} className={styles.list}>
      {sources.map((source) => (
        <li className={styles.listItem} key={`${source.material_id}-${source.chunk_id}`}>
          <div className={styles.row}>
            <span>
              {source.filename} · {t('materialPage')} {source.page_number}
            </span>
            {onOpenReference ? (
              <AntButton
                aria-label={`${t('a11yOpenReference')}: ${source.filename}, ${
                  t('materialPage')
                } ${source.page_number}`}
                htmlType="button"
                onClick={() => onOpenReference({ ...source })}
                size="small"
              >
                {t('materialOpenReference')}
              </AntButton>
            ) : null}
          </div>
          <span className={styles.muted}>
            {t('materialCitation')}: {source.citation_locator}
          </span>
        </li>
      ))}
    </ul>
  );
}

/**
 * Accessible, bounded graph snapshot with explicit host navigation callbacks.
 * Rendering and local selection never invoke plugin operations. All diagram
 * colors come from host semantic tokens via the shared static styles.
 */
export function GraphResult({
  data,
  className,
  onOpenReference,
  onFocusConcept,
  onAskConcept,
  onOpenActivity,
  onOpenExperiment,
  origin,
}: ResultProps<GraphNeighborhoodOutput>) {
  const t = useEduFishTranslation();
  const titleId = useId();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const focusAfterSelection = useRef<string | null>(null);

  const nodesById = new Map(data.nodes.map((node) => [node.id, node]));
  const selectedNode =
    (selectedId ? nodesById.get(selectedId) : undefined) ?? data.nodes[0];
  const graphContext = data.context?.version === 1 ? data.context : undefined;
  const selectedLinks = graphContext?.concepts.find(
    (concept) => concept.concept_id === selectedNode?.id,
  );
  const edgeSourcesById = new Map(
    graphContext?.edges.map((edge) => [edge.edge_id, edge.sources]) ?? [],
  );
  const visibleSources = (sources: readonly GraphSourceReference[]) =>
    sources.filter((source) => source.course_id === graphContext?.course_id);
  const selectedSources = visibleSources(selectedLinks?.sources ?? []);

  const conceptContextFor = (
    node: GraphNeighborhoodOutput['nodes'][number],
  ): EduFishConceptContext | undefined => {
    if (!graphContext) return undefined;
    return {
      course_id: graphContext.course_id,
      concept_id: node.id,
      label: node.label,
      graph_snapshot_id: graphContext.snapshot_id,
      ...(origin ? { origin: { ...origin } } : {}),
    };
  };
  const selectedContext = selectedNode ? conceptContextFor(selectedNode) : undefined;

  const visibleNodes = data.nodes.slice(0, MAX_DIAGRAM_NODES);
  const visibleIds = new Set(visibleNodes.map((node) => node.id));
  const positionedNodes = layoutNodes(visibleNodes);
  const positionsById = new Map(
    positionedNodes.map((node) => [node.id, node]),
  );
  const diagramEdges = data.edges
    .filter(
      (edge) =>
        visibleIds.has(edge.source_id) && visibleIds.has(edge.target_id),
    )
    .slice(0, MAX_DIAGRAM_EDGES);
  const incidentEdges = selectedNode
    ? data.edges
        .filter(
          (edge) =>
            edge.source_id === selectedNode.id ||
            edge.target_id === selectedNode.id,
        )
        .slice(0, MAX_INCIDENT_EDGES)
    : [];
  const incidentEdgeCount = selectedNode
    ? data.edges.filter(
        (edge) =>
          edge.source_id === selectedNode.id ||
          edge.target_id === selectedNode.id,
      ).length
    : 0;

  return (
    <section
      className={mergeClassNames(styles.root, className)}
      aria-labelledby={titleId}
    >
      <header className={styles.header}>
        <h3 className={styles.title} id={titleId}>
          {t('a11yGraph')}
        </h3>
        <span className={styles.muted}>
          {t('graphNodes')}: {data.nodes.length} · {t('graphEdges')}:{' '}
          {data.edges.length}
        </span>
      </header>

      {data.nodes.length === 0 ? (
        <EmptyState message={t('graphEmpty')} />
      ) : (
        <>
          <svg
            aria-describedby={`${titleId}-desc`}
            aria-label={t('graphDescription')}
            className={styles.graphSvg}
            preserveAspectRatio="xMidYMid meet"
            role="img"
            viewBox={`0 0 ${VIEWBOX_WIDTH} ${VIEWBOX_HEIGHT}`}
          >
            <title id={`${titleId}-title`}>{t('graphDescription')}</title>
            <desc id={`${titleId}-desc`}>{t('graphDescription')}</desc>

            {diagramEdges.map((edge, index) => {
              const source = positionsById.get(edge.source_id);
              const target = positionsById.get(edge.target_id);
              if (!source || !target) return null;
              const highlighted =
                selectedNode !== undefined &&
                (edge.source_id === selectedNode.id ||
                  edge.target_id === selectedNode.id);
              return (
                <line
                  className={mergeClassNames(
                    styles.edge,
                    highlighted ? styles.edgeActive : undefined,
                  )}
                  key={`${edge.id}-${index}`}
                  x1={source.x}
                  y1={source.y}
                  x2={target.x}
                  y2={target.y}
                >
                  <title>{edge.relationship}</title>
                </line>
              );
            })}

            {positionedNodes.map((node, index) => {
              const selected = selectedNode?.id === node.id;
              return (
                <g key={`${node.id}-${index}`}>
                  <circle
                    className={mergeClassNames(
                      styles.node,
                      selected ? styles.nodeSelected : undefined,
                    )}
                    cx={node.x}
                    cy={node.y}
                    r={16}
                  />
                  <text
                    className={mergeClassNames(
                      styles.nodeLabel,
                      selected ? styles.nodeLabelSelected : undefined,
                    )}
                    textAnchor="middle"
                    x={node.x}
                    y={node.y + 32}
                  >
                    {truncateText(node.label, 18)}
                  </text>
                </g>
              );
            })}
          </svg>

          {data.nodes.length > visibleNodes.length ? (
            <p className={styles.muted}>
              {t('graphTruncatedDiagram', {
                count: visibleNodes.length,
              })}
            </p>
          ) : null}

          <div>
            <h4 className={styles.subtitle}>{t('graphNodeList')}</h4>
            <p className={styles.muted}>{t('graphSelectNode')}</p>
            <ul className={styles.scrollList}>
              {data.nodes.map((node, index) => {
                const selected = selectedNode?.id === node.id;
                return (
                  <li key={`${node.id}-${index}`}>
                    <AntButton
                      aria-pressed={selected}
                      htmlType="button"
                      onClick={(event) => {
                        focusAfterSelection.current =
                          selectedNode?.id !== node.id && event.currentTarget === document.activeElement
                            ? node.id
                            : null;
                        setSelectedId(node.id);
                        const context = conceptContextFor(node);
                        if (context) onFocusConcept?.(context);
                      }}
                      ref={(element) => {
                        // Ant Design replaces its button when the selected variant changes.
                        if (element && focusAfterSelection.current === node.id) {
                          focusAfterSelection.current = null;
                          element.focus();
                        }
                      }}
                      size="small"
                      type={selected ? 'primary' : 'text'}
                    >
                      {node.label}
                    </AntButton>
                  </li>
                );
              })}
            </ul>
          </div>

          {selectedNode ? (
            <Block
              aria-atomic="true"
              aria-live="polite"
              className={styles.card}
            >
              <h4 className={styles.subtitle}>
                {t('graphNodeDetails')} · {selectedNode.label}
              </h4>

              <h5 className={styles.subtitle}>{t('graphDefinition')}</h5>
              <p className={styles.body}>
                {selectedNode.definition || t('graphNoDefinition')}
              </p>

              {selectedContext && onAskConcept ? (
                <div className={styles.actions}>
                  <AntButton
                    htmlType="button"
                    onClick={() => onAskConcept(selectedContext)}
                    size="small"
                  >
                    {t('graphAskConcept')}
                  </AntButton>
                </div>
              ) : null}

              {selectedLinks ? (
                <div>
                  <h5 className={styles.subtitle}>{t('graphSources')}</h5>
                  {selectedSources.length > 0 ? (
                    <GraphSources
                      onOpenReference={onOpenReference}
                      sources={selectedSources}
                    />
                  ) : (
                    <p className={styles.muted}>{t('graphNoSources')}</p>
                  )}
                </div>
              ) : null}

              {selectedContext && onOpenActivity && selectedLinks && selectedLinks.activities.length > 0 ? (
                <div>
                  <h5 className={styles.subtitle}>{t('graphActivities')}</h5>
                  <ul className={styles.list}>
                    {selectedLinks.activities.map((activity) => (
                      <li key={activity.activity_id}>
                        <AntButton
                          htmlType="button"
                          onClick={() => onOpenActivity({ ...selectedContext, activity })}
                          size="small"
                        >
                          {t('graphOpenActivity', { title: activity.title })}
                        </AntButton>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              {selectedContext && onOpenExperiment && selectedLinks && selectedLinks.experiments.length > 0 ? (
                <div>
                  <h5 className={styles.subtitle}>{t('graphExperiments')}</h5>
                  <ul className={styles.list}>
                    {selectedLinks.experiments.map((experiment) => (
                      <li key={experiment.template_id}>
                        <AntButton
                          htmlType="button"
                          onClick={() => onOpenExperiment({ ...selectedContext, experiment })}
                          size="small"
                        >
                          {t('graphOpenExperiment', { title: experiment.title })}
                        </AntButton>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              <h5 className={styles.subtitle}>{t('graphEdgeList')}</h5>
              <ul className={styles.list}>
                {incidentEdges.length === 0 ? (
                  <li>
                    <Text className={styles.muted}>
                      {t('graphNoRelationships')}
                    </Text>
                  </li>
                ) : (
                  incidentEdges.map((edge, index) => {
                    const outgoing = edge.source_id === selectedNode.id;
                    const otherId = outgoing
                      ? edge.target_id
                      : edge.source_id;
                    const otherLabel =
                      nodesById.get(otherId)?.label ?? otherId;
                    const arrow =
                      edge.source_id === edge.target_id ? '↔' : outgoing ? '→' : '←';
                    const edgeSources = visibleSources(edgeSourcesById.get(edge.id) ?? []);
                    return (
                      <li
                        className={styles.listItem}
                        key={`${edge.id}-${index}`}
                      >
                        <span>
                          {arrow} {otherLabel} — {edge.relationship}
                        </span>
                        {edge.evidence ? (
                          <details>
                            <summary className={styles.muted}>
                              {t('graphEvidence')}
                            </summary>
                            <p className={styles.body}>
                              {truncateText(
                                edge.evidence,
                                MAX_EVIDENCE_CHARS,
                              )}
                            </p>
                          </details>
                        ) : null}
                        {edgeSources.length > 0 ? (
                          <GraphSources
                            onOpenReference={onOpenReference}
                            sources={edgeSources}
                          />
                        ) : null}
                      </li>
                    );
                  })
                )}
              </ul>
              {incidentEdgeCount > incidentEdges.length ? (
                <p className={styles.muted}>
                  {t('graphMoreRelationships', {
                    count: incidentEdgeCount - incidentEdges.length,
                  })}
                </p>
              ) : null}
            </Block>
          ) : null}
        </>
      )}
    </section>
  );
}
