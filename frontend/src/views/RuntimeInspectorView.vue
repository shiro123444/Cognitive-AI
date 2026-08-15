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
    <header class="runtime-inspector__header hero-banner">
      <div class="runtime-inspector__heading">
        <span class="runtime-inspector__kicker mono">
          <span class="sq sq-cyan" /> EDUFISH RUNTIME
        </span>
        <h1 class="hero-banner-title">Agent Runtime Inspector</h1>
        <p class="runtime-inspector__session mono">
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

    <p v-if="model.error" class="runtime-inspector__error" role="alert">
      <span class="sq sq-orange" /> {{ model.error }}
    </p>

    <dl class="runtime-inspector__stats">
      <div class="stat-box">
        <dt class="mono">Runs</dt>
        <dd class="mono">{{ model.runCount }}</dd>
      </div>
      <div class="stat-box">
        <dt class="mono">Events</dt>
        <dd class="mono">{{ model.eventCount }}</dd>
      </div>
      <div class="stat-box">
        <dt class="mono">Latest Event</dt>
        <dd class="mono">{{ model.latestEventType || 'None' }}</dd>
      </div>
    </dl>

    <section class="runtime-inspector__events panel" aria-label="Runtime event stream">
      <div class="events-head">
        <h2>
          <span class="sq sq-yellow" /> 事件序列流
        </h2>
        <span class="pulse-indicator mono">
          <span class="sq on" /> LIVE POLL (3s)
        </span>
      </div>
      <p v-if="!model.recentEvents.length" class="runtime-inspector__empty mono">
        {{ isBusy ? '连接 Runtime…' : '暂无事件。点击上方「新建测试 Run」触发一次 Agent 编排。' }}
      </p>
      <ol v-else class="event-timeline">
        <li v-for="(event, idx) in model.recentEvents" :key="(event.seq || '') + event.type + idx" class="event-row">
          <span class="runtime-inspector__seq mono">#{{ event.seq }}</span>
          <span class="runtime-inspector__type mono">{{ event.type }}</span>
          <span v-if="event.detail" class="runtime-inspector__detail">{{ event.detail }}</span>
        </li>
      </ol>
    </section>
  </section>
</template>

<style scoped>
.runtime-inspector {
  display: grid;
  gap: 20px;
  padding: 24px var(--shell-pad-x);
  max-width: var(--grid-max);
  margin: 0 auto;
}

.runtime-inspector__header {
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  gap: 16px;
  flex-wrap: wrap;
}

.runtime-inspector__heading {
  display: grid;
  gap: 6px;
}

.runtime-inspector__kicker {
  font-size: 11px;
  font-weight: 800;
  display: flex;
  align-items: center;
  gap: 6px;
  color: var(--rk-ink);
}

.runtime-inspector__session {
  margin: 0;
  font-size: 12px;
  color: var(--rk-muted);
  display: flex;
  align-items: center;
  gap: 8px;
}

.runtime-inspector__proto {
  padding: 2px 6px;
  background: var(--rk-white);
  border: 1px solid var(--rk-ink);
  color: var(--rk-ink);
  font-size: 10px;
  font-weight: 700;
}

.runtime-inspector__error {
  margin: 0;
  padding: 10px 14px;
  background: var(--rk-orange);
  border: 2px solid var(--rk-ink);
  color: var(--rk-ink);
  font-weight: 700;
  display: flex;
  align-items: center;
  gap: 8px;
}

.runtime-inspector__stats {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 16px;
  margin: 0;
}

.stat-box {
  padding: 16px;
  background: var(--rk-white);
  border: 2px solid var(--rk-ink);
  box-shadow: var(--rk-shadow);
  display: grid;
  gap: 4px;
}

.stat-box dt {
  font-size: 11px;
  font-weight: 800;
  color: var(--rk-muted);
  letter-spacing: 0.06em;
}

.stat-box dd {
  margin: 0;
  font-size: 1.6rem;
  font-weight: 900;
  color: var(--rk-ink);
}

.events-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-bottom: 2px solid var(--rk-ink);
  padding-bottom: 12px;
  margin-bottom: 16px;
}

.events-head h2 {
  margin: 0;
  font-size: 16px;
  font-weight: 900;
  display: flex;
  align-items: center;
  gap: 8px;
}

.pulse-indicator {
  font-size: 11px;
  font-weight: 800;
  display: flex;
  align-items: center;
  gap: 6px;
  color: var(--rk-muted);
}

.event-timeline {
  list-style: none;
  padding: 0;
  margin: 0;
  display: grid;
  gap: 8px;
  max-height: 500px;
  overflow-y: auto;
}

.event-row {
  display: grid;
  grid-template-columns: 60px 180px minmax(0, 1fr);
  gap: 12px;
  align-items: center;
  padding: 8px 12px;
  background: var(--rk-white);
  border: 1.5px solid var(--rk-ink);
  box-shadow: 1px 1px 0 var(--rk-ink);
  font-size: 12.5px;
}

.event-row:hover {
  background: rgba(217, 182, 63, 0.12);
}

.runtime-inspector__seq {
  font-weight: 800;
  color: var(--rk-muted);
}

.runtime-inspector__type {
  font-weight: 800;
  color: var(--rk-ink);
  padding: 2px 6px;
  background: var(--rk-panel);
  border: 1px solid var(--rk-ink);
  width: fit-content;
}

.runtime-inspector__detail {
  color: var(--rk-ink);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.runtime-inspector__empty {
  padding: 32px;
  text-align: center;
  color: var(--rk-muted);
  font-size: 13px;
}

@media (max-width: 760px) {
  .runtime-inspector__stats {
    grid-template-columns: 1fr;
  }
  .event-row {
    grid-template-columns: 1fr;
    gap: 4px;
  }
}
</style>
