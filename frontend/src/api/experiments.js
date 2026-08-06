import apiClient from './client';

export function listExperiments(params = {}) {
  return apiClient.get('/api/experiments', { params });
}

export function exploreExperiments(query) {
  return apiClient.get('/api/experiments/explore', { params: { q: query } });
}

export function getExperiment(experimentId) {
  return apiClient.get(`/api/experiments/${experimentId}`);
}

export function runExperiment(experimentId, payload) {
  return apiClient.post(`/api/experiments/${experimentId}/runs`, payload);
}

export function getExperimentRun(runId) {
  return apiClient.get(`/api/experiment-runs/${runId}`);
}

/**
 * Subscribe to an ExperimentRun's progress via Server-Sent Events.
 *
 * The backend emits events whose payload is the full run serialization:
 *   snapshot — initial state on connect
 *   update   — state changed (progress, pipeline_nodes, status, etc.)
 *   done     — {status: 'completed'|'failed'}
 *   error    — server-side error
 *   timeout  — server hit its 90s ceiling; client should reconnect
 *
 * Resolves when the stream ends (status=done/error) or the caller aborts.
 *
 * @param {string} runId
 * @param {Object} handlers — {onSnapshot(run), onUpdate(run), onDone(meta), onError(meta), onTimeout(meta)}
 * @param {AbortSignal} [signal]
 * @returns {Promise<void>}
 */
export function streamExperimentRun(runId, handlers = {}, signal) {
  return (async () => {
    const response = await fetch(`/api/experiment-runs/${runId}/events/stream`, {
      method: 'GET',
      signal,
      headers: { Accept: 'text/event-stream' }
    });

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new Error(`experiment stream failed: ${response.status} ${text || response.statusText}`);
    }
    if (!response.body) {
      throw new Error('experiment stream has no body');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let buffer = '';

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      let sep;
      while ((sep = buffer.indexOf('\n\n')) !== -1) {
        const frame = buffer.slice(0, sep);
        buffer = buffer.slice(sep + 2);
        const stop = handleExperimentFrame(frame, handlers);
        if (stop === 'done') {
          try { reader.cancel(); } catch (_) { /* noop */ }
          return;
        }
      }
    }
    if (buffer.trim()) {
      handleExperimentFrame(buffer, handlers);
    }
  })();
}

function handleExperimentFrame(frame, handlers) {
  // Each SSE frame can contain event: and data: lines.
  let eventName = 'message';
  const dataLines = [];
  for (const line of frame.split('\n')) {
    if (line.startsWith('event:')) {
      eventName = line.slice(6).trim();
    } else if (line.startsWith('data:')) {
      dataLines.push(line.slice(5).trim());
    }
  }
  if (!dataLines.length) return null;
  const data = dataLines.join('\n');
  if (data === '[DONE]') {
    if (typeof handlers.onDone === 'function') handlers.onDone({ status: 'done' });
    return 'done';
  }
  let parsed;
  try { parsed = JSON.parse(data); }
  catch (_) { return null; }

  switch (eventName) {
    case 'snapshot':
      if (typeof handlers.onSnapshot === 'function') handlers.onSnapshot(parsed);
      return null;
    case 'update':
      if (typeof handlers.onUpdate === 'function') handlers.onUpdate(parsed);
      return null;
    case 'done':
      if (typeof handlers.onDone === 'function') handlers.onDone(parsed);
      return 'done';
    case 'error':
      if (typeof handlers.onError === 'function') handlers.onError(parsed);
      return 'done';
    case 'timeout':
      if (typeof handlers.onTimeout === 'function') handlers.onTimeout(parsed);
      return 'done';
    default:
      // forward-compat: unknown events silently ignored
      return null;
  }
}
