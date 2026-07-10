/**
 * Agent catalog — mirrors backend AGENT_CONFIGS tool whitelists.
 *
 * Used by the Node runtime to scope which capabilities each agent may call.
 * Keep in sync with backend/app/agents/definitions.py.
 */

export interface RuntimeAgentDef {
  agent_id: string;
  role: string;
  description: string;
  /** Capability ids this agent may invoke (`*` = all discovered tools). */
  tools: string[] | '*';
  /** Agents this agent may delegate to via runtime.delegate. Empty = cannot delegate. */
  allowed_targets: string[];
  /** Default system prompt when caller does not override. */
  system_prompt: string;
}

const SUPERVISOR_PROMPT =
  'You are a supervisor agent. Split complex goals into specialist sub-tasks, ' +
  'call runtime.delegate with clear goals per child, then synthesize their results.';

const TUTOR_PROMPT =
  'You are a course tutor. Prefer search_materials and search_concept_graph before answering. Respond in Chinese when the user does.';

const DOCUMENT_ANALYST_PROMPT =
  'You are a document analyst. Extract concepts, relations, and quiz items from course materials using search tools.';

const GRAPH_EXPLORER_PROMPT =
  'You are a knowledge-graph guide. Use search_concept_graph and related tools to map concept relations.';

const EDU_COLLECTOR_PROMPT =
  'You are the EduFish data collector. Call collect_edu_data, then trigger_edu_analysis, then check_edu_analysis_status.';

export const AGENT_CATALOG: Record<string, RuntimeAgentDef> = {
  supervisor: {
    agent_id: 'supervisor',
    role: 'supervisor',
    description: 'Plans and fans out work to specialist agents',
    tools: '*',
    allowed_targets: ['tutor', 'document-analyst', 'graph-explorer', 'edu-collector'],
    system_prompt: SUPERVISOR_PROMPT,
  },
  tutor: {
    agent_id: 'tutor',
    role: 'tutor',
    description: 'AI learning assistant',
    tools: [
      'search_materials',
      'search_concept_graph',
      'get_chapter',
      'list_chapters',
      'get_quiz_items_for_chapter',
      'runtime.echo',
    ],
    allowed_targets: [],
    system_prompt: TUTOR_PROMPT,
  },
  'document-analyst': {
    agent_id: 'document-analyst',
    role: 'analyst',
    description: 'Extracts concepts and relations from materials',
    tools: ['search_materials', 'search_concept_graph', 'runtime.echo'],
    allowed_targets: [],
    system_prompt: DOCUMENT_ANALYST_PROMPT,
  },
  'graph-explorer': {
    agent_id: 'graph-explorer',
    role: 'explorer',
    description: 'Knowledge graph navigator',
    tools: ['search_concept_graph', 'list_chapters', 'search_materials', 'runtime.echo'],
    allowed_targets: [],
    system_prompt: GRAPH_EXPLORER_PROMPT,
  },
  'edu-collector': {
    agent_id: 'edu-collector',
    role: 'collector',
    description: 'Collects learning data and triggers analysis',
    tools: [
      'collect_edu_data',
      'trigger_edu_analysis',
      'check_edu_analysis_status',
      'runtime.echo',
    ],
    allowed_targets: [],
    system_prompt: EDU_COLLECTOR_PROMPT,
  },
};

export function getAgentDef(agentId: string): RuntimeAgentDef | undefined {
  return AGENT_CATALOG[agentId];
}

/**
 * Whether this agent may use runtime.delegate at all.
 * - Known agent with empty allowed_targets → no
 * - Known agent with non-empty allowed_targets → yes
 * - Unknown agent → yes (open default for custom agents)
 */
export function agentMayDelegate(agentId: string): boolean {
  const def = getAgentDef(agentId);
  if (!def) return true;
  return def.allowed_targets.length > 0;
}

/**
 * Resolve the effective tool allowlist for an agent run.
 *
 * Precedence:
 * 1. Explicit toolAllowlist from the caller (e.g. parent-granted tools)
 * 2. Agent catalog tools for agentId
 * 3. undefined → no restriction (all discovered capabilities)
 */
export function resolveToolAllowlist(
  agentId: string,
  explicit?: string[] | null,
): string[] | '*' | undefined {
  if (explicit && explicit.length > 0) {
    return explicit;
  }
  const def = getAgentDef(agentId);
  if (!def) return undefined;
  return def.tools;
}

/**
 * Filter capability tool defs by allowlist.
 */
export function filterToolsByAllowlist<T extends { name: string }>(
  tools: T[],
  allowlist: string[] | '*' | undefined,
): T[] {
  if (allowlist === undefined || allowlist === '*') {
    return tools;
  }
  const allowed = new Set(allowlist);
  return tools.filter((t) => allowed.has(t.name));
}

/**
 * Map grant_ids to a tool allowlist when grants encode tool scopes.
 *
 * Supported forms:
 * - `tool:search_materials` → search_materials
 * - bare capability id (`search_*`, `get_*`, `list_*`, `collect_*`, `trigger_*`, `check_*`, `runtime.*`)
 * - otherwise ignored (opaque context grant refs)
 */
export function toolAllowlistFromGrants(grantIds: string[] | undefined): string[] | undefined {
  if (!grantIds || grantIds.length === 0) return undefined;

  const tools: string[] = [];
  for (const g of grantIds) {
    if (g.startsWith('tool:')) {
      tools.push(g.slice('tool:'.length));
      continue;
    }
    if (
      g.startsWith('search_') ||
      g.startsWith('get_') ||
      g.startsWith('list_') ||
      g.startsWith('collect_') ||
      g.startsWith('trigger_') ||
      g.startsWith('check_') ||
      g.startsWith('runtime.')
    ) {
      tools.push(g);
    }
  }
  return tools.length > 0 ? tools : undefined;
}

/** Validate that a supervisor may delegate to the given child agent. */
export function canDelegateTo(fromAgentId: string, toAgentId: string): boolean {
  const from = getAgentDef(fromAgentId);
  if (!from) {
    // Unknown parent: allow (open by default for custom agents)
    return true;
  }
  if (from.allowed_targets.length === 0) return false;
  if (from.allowed_targets.includes('*')) return true;
  return from.allowed_targets.includes(toAgentId);
}

export function defaultSystemPrompt(agentId: string, fallback?: string): string {
  return getAgentDef(agentId)?.system_prompt ?? fallback ?? `You are the ${agentId} agent.`;
}
