import { describe, expect, it } from 'vitest';

import {
  AGENT_CATALOG,
  agentMayDelegate,
  canDelegateTo,
  filterToolsByAllowlist,
  resolveToolAllowlist,
  toolAllowlistFromGrants,
} from '../src/agent/agent-catalog.js';

describe('agent catalog', () => {
  it('mirrors backend specialist tool whitelists', () => {
    expect(AGENT_CATALOG.tutor.tools).toContain('search_materials');
    expect(AGENT_CATALOG['document-analyst'].tools).toEqual(
      expect.arrayContaining(['search_materials', 'search_concept_graph']),
    );
    expect(AGENT_CATALOG['graph-explorer'].tools).toContain('search_concept_graph');
    expect(AGENT_CATALOG['edu-collector'].tools).toContain('collect_edu_data');
  });

  it('only supervisors may delegate', () => {
    expect(agentMayDelegate('supervisor')).toBe(true);
    expect(agentMayDelegate('tutor')).toBe(false);
    expect(agentMayDelegate('document-analyst')).toBe(false);
    expect(agentMayDelegate('custom-agent')).toBe(true); // unknown = open
  });

  it('enforces allowed_targets for known supervisors', () => {
    expect(canDelegateTo('supervisor', 'document-analyst')).toBe(true);
    expect(canDelegateTo('supervisor', 'unknown-child')).toBe(false);
    expect(canDelegateTo('tutor', 'document-analyst')).toBe(false);
  });

  it('resolves tool allowlist from catalog and explicit override', () => {
    expect(resolveToolAllowlist('tutor')).toEqual(AGENT_CATALOG.tutor.tools);
    expect(resolveToolAllowlist('tutor', ['runtime.echo'])).toEqual(['runtime.echo']);
    expect(resolveToolAllowlist('supervisor')).toBe('*');
  });

  it('filters tools by allowlist', () => {
    const tools = [
      { name: 'search_materials' },
      { name: 'collect_edu_data' },
      { name: 'runtime.echo' },
    ];
    expect(filterToolsByAllowlist(tools, ['search_materials', 'runtime.echo']).map((t) => t.name)).toEqual([
      'search_materials',
      'runtime.echo',
    ]);
    expect(filterToolsByAllowlist(tools, '*')).toHaveLength(3);
  });

  it('maps grant_ids that encode tool scopes', () => {
    expect(toolAllowlistFromGrants(['tool:search_materials', 'grant-opaque', 'runtime.echo'])).toEqual([
      'search_materials',
      'runtime.echo',
    ]);
    expect(toolAllowlistFromGrants(['grant-materials'])).toBeUndefined();
  });
});
