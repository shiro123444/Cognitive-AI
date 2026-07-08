<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';

import { createRuntimeSession, listRuntimeEvents, startRuntimeRun } from '../api/runtime';
import { buildRuntimeInspectorModel } from './runtimeInspectorState';

const SESSION_KEY = 'edufish.runtime.session_id';
const POLL_MS = 3000;

const session = ref(null);
const events = ref([]);
const runs = ref([]);
const error = ref('');
const isBusy = ref(false);
const isRunning = ref(false);
let pollTimer = null;

const model = computed(() => buildRuntimeInspectorModel({
  session: session.value,
  events: events.value,
  runs: runs.value,
  error: error.value
}));

function rememberSession(id) {
  if (id && typeof localStorage !== 'undefined') {
    try { localStorage.setItem(SESSION_KEY, id); } catch { /* storage may be unavailable */ }
  }
}

async function ensureSession() {
  let stored = '';
  try { stored = typeof localStorage !== 'undefined' ? localStorage.getItem(SESSION_KEY) || '' : ''; } catch { /* noop */ }
  if (stored) {
    session.value = { session_id: stored };
    return stored;
  }
  const created = await createRuntimeSession(['user:inspector']);
  const id = created?.session_id || '';
  rememberSession(id);
  session.value = created;
  return id;
}

async function refreshEvents() {
  const id = session.value?.session_id;
  if (!id) return;
  const lastSeq = events.value.at(-1)?.session_seq ?? 0;
  const res = await listRuntimeEvents(id, lastSeq);
  const fresh = res?.events ?? [];
  if (fresh.length) events.value = [...events.value, ...fresh];
}

async function bootstrap() {
  isBusy.value = true;
  error.value = '';
  try {
    await ensureSession();
    await refreshEvents();
    pollTimer = setInterval(refreshEvents, POLL_MS);
  } catch (err) {
    error.value = err?.message || 'Runtime 不可达：需启动 Node Runtime 服务，并经 nginx 反代 /runtime。';
  } finally {
    isBusy.value = false;
  }
}

async function triggerRun() {
  const id = session.value?.session_id;
  if (!id || isRunning.value) return;
  isRunning.value = true;
  error.value = '';
  try {
    await startRuntimeRun({
      session_id: id,
      agent_id: 'tutor',
      system_prompt: 'You are a runtime smoke-test agent.',
      user_message: 'ping'
    });
    runs.value = [...runs.value, { at: Date.now() }];
    await refreshEvents();
  } catch (err) {
    error.value = err?.message || 'Run 失败。';
  } finally {
    isRunning.value = false;
  }
}

onMounted(bootstrap);
onBeforeUnmount(() => { if (pollTimer) clearInterval(pollTimer); });
</script>

<template>
  <section class="runtime-inspector">
    <header class="runtime-inspector__header">
      <div class="runtime-inspector__heading">
        <span class="runtime-inspector__kicker">EDUFISH Runtime</span>
        <h1>Agent Runtime Inspector</h1>
        <p class="runtime-inspector__session">
          <template v-if="model.sessionId">session · {{ model.sessionId }}</template>
          <template v-else>No active session</template>
          <span v-if="model.protocolVersion" class="runtime-inspector__proto">{{ model.protocolVersion }}</span>
        </p>
      </div>
      <button
        class="btn btn-primary runtime-inspector__run"
        type="button"
        :disabled="isRunning || !model.sessionId"
        @click="triggerRun"
      >
        {{ isRunning ? '运行中…' : '▶ 新建测试 Run' }}
      </button>
    </header>

    <p v-if="model.error" class="runtime-inspector__error" role="alert">{{ model.error }}</p>

    <dl class="runtime-inspector__stats">
      <div>
        <dt>Runs</dt>
        <dd>{{ model.runCount }}</dd>
      </div>
      <div>
        <dt>Events</dt>
        <dd>{{ model.eventCount }}</dd>
      </div>
      <div>
        <dt>Latest Event</dt>
        <dd>{{ model.latestEventType || 'None' }}</dd>
      </div>
    </dl>

    <section class="runtime-inspector__events" aria-label="Runtime event stream">
      <h2>事件流</h2>
      <p v-if="!model.recentEvents.length" class="runtime-inspector__empty">
        {{ isBusy ? '连接 Runtime…' : '暂无事件。点击「新建测试 Run」触发一次编排。' }}
      </p>
      <ol v-else>
        <li v-for="(event, idx) in model.recentEvents" :key="(event.seq || '') + event.type + idx">
          <span class="runtime-inspector__seq">{{ event.seq }}</span>
          <span class="runtime-inspector__type">{{ event.type }}</span>
          <span v-if="event.detail" class="runtime-inspector__detail">{{ event.detail }}</span>
        </li>
      </ol>
    </section>
  </section>
</template>

<style scoped>
.runtime-inspector {
  display: grid;
  gap: var(--space-6);
  padding: var(--space-8) max(var(--space-8), 5vw);
  max-width: var(--grid-max);
  margin: 0 auto;
}

.runtime-inspector__header {
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  gap: var(--space-4);
  flex-wrap: wrap;
}

.runtime-inspector__kicker {
  display: block;
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--text-2);
}

.runtime-inspector__heading h1 {
  margin: 0.25rem 0 0;
  font-size: var(--text-3xl);
  font-weight: 700;
  letter-spacing: -0.01em;
  color: var(--text-1);
}

.runtime-inspector__session {
  margin: 0.5rem 0 0;
  font-family: var(--font-mono);
  font-size: var(--text-sm);
  color: var(--text-2);
  word-break: break-all;
}

.runtime-inspector__proto {
  margin-left: 0.5rem;
  padding: 0.1rem 0.4rem;
  border: 1px solid var(--border-default);
  color: var(--primary);
}

.runtime-inspector__stats {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(0, 200px));
  gap: var(--space-3);
  margin: 0;
}

.runtime-inspector__stats div {
  padding: var(--space-4);
  border: 1px solid var(--border-default);
  background: var(--surface-1);
}

.runtime-inspector__stats dt {
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--text-2);
}

.runtime-inspector__stats dd {
  margin: 0.4rem 0 0;
  font-size: var(--text-2xl);
  font-weight: 700;
  color: var(--text-1);
}

.runtime-inspector__events h2 {
  margin: 0 0 var(--space-3);
  font-family: var(--font-mono);
  font-size: var(--text-sm);
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--text-2);
}

.runtime-inspector__events ol {
  list-style: none;
  margin: 0;
  padding: 0;
  border: 1px solid var(--border-default);
  border-top: 4px solid var(--primary);
}

.runtime-inspector__events li {
  display: grid;
  grid-template-columns: 3rem 13rem 1fr;
  gap: var(--space-3);
  padding: var(--space-2) var(--space-3);
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  border-bottom: 1px solid var(--border-default);
}

.runtime-inspector__events li:last-child {
  border-bottom: 0;
}

.runtime-inspector__seq {
  color: var(--text-3);
}

.runtime-inspector__type {
  color: var(--primary);
  font-weight: 600;
}

.runtime-inspector__detail {
  color: var(--text-2);
}

.runtime-inspector__empty {
  margin: 0;
  padding: var(--space-6);
  border: 1px dashed var(--border-default);
  font-size: var(--text-sm);
  color: var(--text-2);
}

.runtime-inspector__error {
  margin: 0;
  padding: var(--space-3) var(--space-4);
  border-left: 3px solid var(--status-error, #b3261e);
  background: var(--surface-1);
  font-size: var(--text-sm);
  color: var(--status-error, #b3261e);
}

.runtime-inspector__run {
  white-space: nowrap;
}
</style>
