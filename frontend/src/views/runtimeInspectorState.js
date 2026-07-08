/**
 * Pure shape mapper for the Runtime Inspector dashboard.
 * Derives a render-ready model from a runtime session + its persisted events.
 * Kept side-effect free so it is trivial to unit test.
 */

export function buildRuntimeInspectorModel({ session = null, events = [], runs = [], error = '' } = {}) {
  const sortedEvents = [...events].sort(
    (a, b) => (a.session_seq ?? 0) - (b.session_seq ?? 0)
  );

  return {
    sessionId: session?.session_id || '',
    protocolVersion: session?.protocol_version || '',
    eventCount: events.length,
    runCount: runs.length,
    latestEventType: sortedEvents.at(-1)?.type || '',
    recentEvents: sortedEvents.slice(-15).map((event) => ({
      seq: event.session_seq ?? '',
      type: event.type || '',
      detail: summarizeEvent(event)
    })),
    error
  };
}

function summarizeEvent(event) {
  const payload = event.payload || {};
  switch (event.type) {
    case 'run.state_changed':
      return `${payload.from ?? '?'} → ${payload.to ?? '?'}`;
    case 'tool.start':
      return `start · ${payload.name || ''}`;
    case 'tool.end':
      return `${payload.status || 'end'} · ${payload.name || ''}`;
    case 'llm.response':
      return payload.tool_calls ? `tool_call × ${payload.tool_calls.length}` : 'text';
    case 'turn.start':
      return `turn ${payload.turn ?? ''}`;
    case 'turn.end':
      return `turn ${payload.turn ?? ''} end`;
    default:
      return '';
  }
}
