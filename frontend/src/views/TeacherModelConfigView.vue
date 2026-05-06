<template>
  <section class="model-config-os" :style="pointerStyle" @mousemove="trackPointer">
    <aside class="config-rail">
      <header class="rail-brand">
        <RouterLink to="/teacher" class="back-link" aria-label="返回教师工作室">‹</RouterLink>
        <div>
          <h1>MODEL CONFIG</h1>
          <p>教师控制台</p>
        </div>
        <span class="brand-node" aria-hidden="true"></span>
      </header>

      <div class="rail-block">
        <div class="rail-head">
          <span>RUNTIME</span>
          <span>{{ loading ? 'SYNC' : 'READY' }}</span>
        </div>
        <strong>{{ form.model || 'mimo-v2.5-pro' }}</strong>
        <small>{{ normalizedBaseUrl }}</small>
      </div>

      <div class="rail-block">
        <div class="rail-head">
          <span>SECRET</span>
          <span>{{ apiKeyStatus }}</span>
        </div>
        <strong>{{ settings.api_key_hint || 'NO KEY' }}</strong>
        <small>API Key 不会在页面回显</small>
      </div>

      <div class="rail-block">
        <div class="rail-head">
          <span>EMBED</span>
          <span>{{ embeddingApiKeyStatus }}</span>
        </div>
        <strong>{{ embeddingForm.model || 'nvidia/nv-embed-v1' }}</strong>
        <small>{{ embeddingForm.base_url || 'https://integrate.api.nvidia.com/v1' }}</small>
      </div>

      <nav class="rail-links" aria-label="Teacher model configuration navigation">
        <RouterLink to="/teacher/edufish" class="rail-link">
          <span>EDUFISH OS</span>
          <i aria-hidden="true">→</i>
        </RouterLink>
        <RouterLink to="/teacher" class="rail-link">
          <span>TEACHER STUDIO</span>
          <i aria-hidden="true">→</i>
        </RouterLink>
      </nav>

      <footer class="rail-footer mono">
        <span class="live-dot" aria-hidden="true"></span>
        OPENAI-COMPATIBLE
      </footer>
    </aside>

    <main class="config-stage">
      <header class="stage-header">
        <p class="mono">LLM GATEWAY / EDUCATION AGENTS</p>
        <h2>模型接入参数</h2>
      </header>

      <form class="config-console" @submit.prevent="saveSettings">
        <div class="console-title mono">
          <span>CHAT LLM</span>
          <small>回答生成</small>
        </div>
        <label class="config-field">
          <span class="mono">BASE URL</span>
          <input
            v-model.trim="form.base_url"
            type="url"
            autocomplete="off"
            spellcheck="false"
            placeholder="https://api.xiaomimimo.com/v1"
          />
        </label>

        <label class="config-field">
          <span class="mono">MODEL</span>
          <input
            v-model.trim="form.model"
            type="text"
            autocomplete="off"
            spellcheck="false"
            placeholder="mimo-v2.5-pro"
          />
        </label>

        <label class="config-field">
          <span class="mono">API KEY</span>
          <input
            v-model.trim="form.api_key"
            type="password"
            autocomplete="new-password"
            spellcheck="false"
            :placeholder="apiKeyPlaceholder"
          />
        </label>

        <label class="clear-key-line mono">
          <input v-model="form.clear_api_key" type="checkbox" />
          清除当前密钥
        </label>

        <div class="console-actions">
          <button type="submit" class="console-button primary" :disabled="saving">
            {{ saving ? 'WRITING' : 'WRITE CONFIG' }} <span aria-hidden="true">→</span>
          </button>
          <button type="button" class="console-button" :disabled="testing" @click="runConnectionTest">
            {{ testing ? 'TESTING' : 'TEST PING' }} <span aria-hidden="true">→</span>
          </button>
        </div>

        <p v-if="message" class="console-message success mono">{{ message }}</p>
        <p v-if="error" class="console-message error mono">{{ error }}</p>
      </form>

      <form class="config-console embedding-console" @submit.prevent="saveEmbeddingSettings">
        <div class="console-title mono">
          <span>EMBEDDING</span>
          <small>RAG 向量检索 / NVIDIA READY</small>
        </div>

        <label class="config-field">
          <span class="mono">BASE URL</span>
          <input
            v-model.trim="embeddingForm.base_url"
            type="url"
            autocomplete="off"
            spellcheck="false"
            placeholder="https://integrate.api.nvidia.com/v1"
          />
        </label>

        <label class="config-field">
          <span class="mono">MODEL</span>
          <input
            v-model.trim="embeddingForm.model"
            type="text"
            autocomplete="off"
            spellcheck="false"
            placeholder="nvidia/nv-embed-v1"
          />
        </label>

        <label class="config-field">
          <span class="mono">API KEY</span>
          <input
            v-model.trim="embeddingForm.api_key"
            type="password"
            autocomplete="new-password"
            spellcheck="false"
            :placeholder="embeddingApiKeyPlaceholder"
          />
        </label>

        <div class="mini-field-grid">
          <label class="mini-field">
            <span class="mono">QUERY TYPE</span>
            <select v-model="embeddingForm.query_input_type">
              <option value="">EMPTY</option>
              <option value="query">query</option>
              <option value="passage">passage</option>
            </select>
          </label>
          <label class="mini-field">
            <span class="mono">PASSAGE TYPE</span>
            <select v-model="embeddingForm.passage_input_type">
              <option value="">EMPTY</option>
              <option value="passage">passage</option>
              <option value="query">query</option>
            </select>
          </label>
          <label class="mini-field">
            <span class="mono">TRUNCATE</span>
            <select v-model="embeddingForm.truncate">
              <option value="">EMPTY</option>
              <option value="NONE">NONE</option>
              <option value="START">START</option>
              <option value="END">END</option>
            </select>
          </label>
        </div>

        <label class="clear-key-line mono">
          <input v-model="embeddingForm.clear_api_key" type="checkbox" />
          清除当前 Embedding 密钥
        </label>

        <div class="console-actions">
          <button type="submit" class="console-button primary" :disabled="embeddingSaving">
            {{ embeddingSaving ? 'WRITING' : 'WRITE EMBED' }} <span aria-hidden="true">→</span>
          </button>
          <button type="button" class="console-button" :disabled="embeddingTesting" @click="runEmbeddingConnectionTest">
            {{ embeddingTesting ? 'TESTING' : 'TEST EMBED' }} <span aria-hidden="true">→</span>
          </button>
        </div>

        <p v-if="embeddingMessage" class="console-message success mono">{{ embeddingMessage }}</p>
        <p v-if="embeddingError" class="console-message error mono">{{ embeddingError }}</p>
      </form>

      <section class="signal-board" aria-label="Model gateway signal">
        <div class="signal-line">
          <span v-for="tick in signalTicks" :key="tick" :style="{ animationDelay: `${tick * 0.08}s` }"></span>
        </div>
        <div class="signal-metrics mono">
          <span>BASE / {{ normalizedBaseUrl }}</span>
          <span>MODEL / {{ form.model || '未设置' }}</span>
          <span>KEY / {{ apiKeyStatus }}</span>
          <span>EMBED / {{ embeddingForm.model || '未设置' }}</span>
        </div>
      </section>
    </main>
  </section>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from 'vue';
import {
  getEmbeddingSettings,
  getLlmSettings,
  testEmbeddingSettings,
  testLlmSettings,
  updateEmbeddingSettings,
  updateLlmSettings
} from '../api/settings';

const settings = reactive({
  base_url: '',
  model: '',
  api_key_configured: false,
  api_key_hint: ''
});

const form = reactive({
  base_url: 'https://api.xiaomimimo.com/v1',
  model: 'mimo-v2.5-pro',
  api_key: '',
  clear_api_key: false
});

const embeddingSettings = reactive({
  base_url: '',
  model: '',
  api_key_configured: false,
  api_key_hint: '',
  query_input_type: '',
  passage_input_type: '',
  truncate: ''
});

const embeddingForm = reactive({
  base_url: 'https://integrate.api.nvidia.com/v1',
  model: 'nvidia/nv-embed-v1',
  api_key: '',
  clear_api_key: false,
  query_input_type: 'query',
  passage_input_type: 'passage',
  truncate: 'END'
});

const loading = ref(false);
const saving = ref(false);
const testing = ref(false);
const embeddingSaving = ref(false);
const embeddingTesting = ref(false);
const message = ref('');
const error = ref('');
const embeddingMessage = ref('');
const embeddingError = ref('');
const pointer = reactive({ x: 50, y: 50 });
const signalTicks = Array.from({ length: 34 }, (_, index) => index);

const apiKeyStatus = computed(() => (settings.api_key_configured ? 'CONFIGURED' : 'EMPTY'));
const embeddingApiKeyStatus = computed(() => (embeddingSettings.api_key_configured ? 'CONFIGURED' : 'EMPTY'));
const apiKeyPlaceholder = computed(() => (
  settings.api_key_configured ? `已配置 ${settings.api_key_hint || ''}，留空则保持不变` : '输入后保存到本地运行配置'
));
const embeddingApiKeyPlaceholder = computed(() => (
  embeddingSettings.api_key_configured
    ? `已配置 ${embeddingSettings.api_key_hint || ''}，留空则保持不变`
    : 'NVIDIA nvapi-... 或其他 embedding key'
));
const normalizedBaseUrl = computed(() => form.base_url || 'https://api.xiaomimimo.com/v1');
const pointerStyle = computed(() => ({
  '--pointer-x': `${pointer.x}%`,
  '--pointer-y': `${pointer.y}%`
}));

onMounted(() => {
  loadSettings();
});

async function loadSettings() {
  loading.value = true;
  error.value = '';

  try {
    const [llm, embedding] = await Promise.all([
      getLlmSettings(),
      getEmbeddingSettings()
    ]);
    applySettings(llm);
    applyEmbeddingSettings(embedding);
  } catch (caughtError) {
    error.value = caughtError?.message || '无法读取模型配置。';
  } finally {
    loading.value = false;
  }
}

async function saveSettings() {
  saving.value = true;
  message.value = '';
  error.value = '';

  try {
    applySettings(await updateLlmSettings(buildPayload()));
    form.api_key = '';
    form.clear_api_key = false;
    message.value = '配置已写入。';
  } catch (caughtError) {
    error.value = caughtError?.message || '无法保存模型配置。';
  } finally {
    saving.value = false;
  }
}

async function runConnectionTest() {
  testing.value = true;
  message.value = '';
  error.value = '';

  try {
    const result = await testLlmSettings(buildPayload());
    message.value = result?.message ? `连接成功：${result.message}` : '连接成功。';
  } catch (caughtError) {
    error.value = caughtError?.message || '模型连接测试失败。';
  } finally {
    testing.value = false;
  }
}

async function saveEmbeddingSettings() {
  embeddingSaving.value = true;
  embeddingMessage.value = '';
  embeddingError.value = '';

  try {
    applyEmbeddingSettings(await updateEmbeddingSettings(buildEmbeddingPayload()));
    embeddingForm.api_key = '';
    embeddingForm.clear_api_key = false;
    embeddingMessage.value = 'Embedding 配置已写入。';
  } catch (caughtError) {
    embeddingError.value = caughtError?.message || '无法保存 Embedding 配置。';
  } finally {
    embeddingSaving.value = false;
  }
}

async function runEmbeddingConnectionTest() {
  embeddingTesting.value = true;
  embeddingMessage.value = '';
  embeddingError.value = '';

  try {
    const result = await testEmbeddingSettings(buildEmbeddingPayload());
    embeddingMessage.value = result?.dimensions
      ? `Embedding 连接成功：${result.dimensions} 维。`
      : 'Embedding 连接成功。';
  } catch (caughtError) {
    embeddingError.value = caughtError?.message || 'Embedding 连接测试失败。';
  } finally {
    embeddingTesting.value = false;
  }
}

function applySettings(payload) {
  settings.base_url = payload?.base_url || 'https://api.xiaomimimo.com/v1';
  settings.model = payload?.model || 'mimo-v2.5-pro';
  settings.api_key_configured = Boolean(payload?.api_key_configured);
  settings.api_key_hint = payload?.api_key_hint || '';
  form.base_url = settings.base_url;
  form.model = settings.model;
}

function applyEmbeddingSettings(payload) {
  embeddingSettings.base_url = payload?.base_url || 'https://integrate.api.nvidia.com/v1';
  embeddingSettings.model = payload?.model || 'nvidia/nv-embed-v1';
  embeddingSettings.api_key_configured = Boolean(payload?.api_key_configured);
  embeddingSettings.api_key_hint = payload?.api_key_hint || '';
  embeddingSettings.query_input_type = payload?.query_input_type || 'query';
  embeddingSettings.passage_input_type = payload?.passage_input_type || 'passage';
  embeddingSettings.truncate = payload?.truncate || 'END';
  embeddingForm.base_url = embeddingSettings.base_url;
  embeddingForm.model = embeddingSettings.model;
  embeddingForm.query_input_type = embeddingSettings.query_input_type;
  embeddingForm.passage_input_type = embeddingSettings.passage_input_type;
  embeddingForm.truncate = embeddingSettings.truncate;
}

function buildPayload() {
  const payload = {
    base_url: form.base_url,
    model: form.model
  };

  if (form.api_key) {
    payload.api_key = form.api_key;
  }
  if (form.clear_api_key) {
    payload.clear_api_key = true;
  }

  return payload;
}

function buildEmbeddingPayload() {
  const payload = {
    base_url: embeddingForm.base_url,
    model: embeddingForm.model,
    query_input_type: embeddingForm.query_input_type,
    passage_input_type: embeddingForm.passage_input_type,
    truncate: embeddingForm.truncate
  };

  if (embeddingForm.api_key) {
    payload.api_key = embeddingForm.api_key;
  }
  if (embeddingForm.clear_api_key) {
    payload.clear_api_key = true;
  }

  return payload;
}

function trackPointer(event) {
  const rect = event.currentTarget.getBoundingClientRect();
  pointer.x = ((event.clientX - rect.left) / rect.width) * 100;
  pointer.y = ((event.clientY - rect.top) / rect.height) * 100;
}
</script>

<style scoped>
.model-config-os {
  min-height: 100vh;
  background:
    linear-gradient(90deg, rgba(0, 34, 255, 0.06) 1px, transparent 1px) 0 0 / 96px 96px,
    radial-gradient(circle at var(--pointer-x) var(--pointer-y), rgba(0, 34, 255, 0.08), transparent 24vw),
    #fff;
  color: var(--text-1);
  display: grid;
  grid-template-columns: minmax(260px, 25vw) 1fr;
  overflow: hidden;
}

.config-rail {
  min-height: 100vh;
  padding: 32px clamp(20px, 3vw, 44px);
  border-right: 1px solid var(--border-dark);
  display: flex;
  flex-direction: column;
  gap: 28px;
}

.rail-brand {
  display: grid;
  grid-template-columns: 30px 1fr 10px;
  gap: 16px;
  align-items: start;
}

.back-link {
  font-size: 34px;
  line-height: 1;
  color: var(--text-1);
  transition: transform var(--dur-2) var(--ease-out-expo), color var(--dur-2) ease;
}

.back-link:hover {
  color: var(--primary);
  transform: translateX(-4px);
}

.rail-brand h1 {
  font-family: var(--font-display);
  font-size: clamp(1.25rem, 1.8vw, 2rem);
  font-weight: 900;
  line-height: 0.98;
  letter-spacing: 0;
  margin: 0;
}

.rail-brand p,
.rail-block small,
.rail-footer {
  color: var(--text-3);
  font-size: 11px;
}

.brand-node {
  width: 9px;
  height: 9px;
  background: var(--primary);
  margin-top: 8px;
  animation: nodePulse 2.6s ease-in-out infinite;
}

.rail-block,
.rail-links {
  border-top: 1px solid var(--border-strong);
  padding-top: 18px;
}

.rail-head {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 14px;
  color: var(--text-4);
  font-family: var(--font-mono);
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 0.16em;
}

.rail-block strong {
  display: block;
  max-width: 100%;
  font-family: var(--font-mono);
  font-size: 12px;
  line-height: 1.5;
  word-break: break-word;
}

.rail-links {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.rail-link {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  padding-bottom: 8px;
  border-bottom: 1px solid var(--border-default);
  color: var(--text-2);
  font-family: var(--font-mono);
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 0.12em;
  transition: color var(--dur-2) ease, border-color var(--dur-2) ease, transform var(--dur-2) ease;
}

.rail-link:hover {
  color: var(--primary);
  border-color: var(--primary);
  transform: translateX(4px);
}

.rail-footer {
  margin-top: auto;
  display: flex;
  align-items: center;
  gap: 10px;
  letter-spacing: 0.14em;
}

.live-dot {
  width: 7px;
  height: 7px;
  background: var(--primary);
  display: inline-block;
  animation: nodePulse 2.2s ease-in-out infinite;
}

.config-stage {
  min-width: 0;
  min-height: 100vh;
  padding: clamp(48px, 7vw, 108px) clamp(28px, 7vw, 120px);
  display: grid;
  grid-template-rows: auto auto auto auto;
  gap: clamp(28px, 4vw, 56px);
}

.stage-header {
  border-bottom: 1px solid var(--border-dark);
  padding-bottom: clamp(18px, 3vw, 34px);
}

.stage-header p {
  color: var(--primary);
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 0.18em;
  margin-bottom: 12px;
}

.stage-header h2 {
  font-family: var(--font-display);
  font-size: clamp(3rem, 8vw, 8.5rem);
  font-weight: 900;
  line-height: 0.92;
  letter-spacing: 0;
  margin: 0;
}

.config-console {
  display: grid;
  gap: clamp(18px, 2.4vw, 28px);
  max-width: 960px;
}

.embedding-console {
  padding-top: clamp(18px, 3vw, 30px);
  border-top: 1px solid var(--border-dark);
}

.console-title {
  display: flex;
  align-items: baseline;
  gap: 18px;
  color: var(--primary);
  font-size: 10px;
  font-weight: 900;
  letter-spacing: 0.18em;
}

.console-title small {
  color: var(--text-4);
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.1em;
}

.config-field {
  display: grid;
  grid-template-columns: minmax(96px, 14vw) 1fr;
  gap: clamp(18px, 4vw, 64px);
  align-items: end;
  border-bottom: 1px solid var(--border-strong);
  padding-bottom: 16px;
}

.config-field span {
  color: var(--text-4);
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 0.18em;
}

.config-field input {
  width: 100%;
  min-width: 0;
  font-family: var(--font-mono);
  font-size: clamp(1rem, 2vw, 1.75rem);
  font-weight: 600;
  line-height: 1.25;
  letter-spacing: 0;
  padding: 0 0 2px;
  background: transparent;
}

.mini-field-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(120px, 1fr));
  gap: 14px;
  max-width: 720px;
}

.mini-field {
  display: grid;
  gap: 8px;
  border-bottom: 1px solid var(--border-strong);
  padding-bottom: 12px;
}

.mini-field span {
  color: var(--text-4);
  font-size: 9px;
  font-weight: 800;
  letter-spacing: 0.16em;
}

.mini-field select {
  width: 100%;
  background: transparent;
  color: var(--text-1);
  font-family: var(--font-mono);
  font-size: 13px;
  font-weight: 800;
}

.config-field input::placeholder {
  color: var(--text-4);
}

.config-field:focus-within {
  border-color: var(--primary);
}

.clear-key-line {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  width: fit-content;
  color: var(--text-3);
  font-size: 11px;
  letter-spacing: 0.08em;
}

.clear-key-line input {
  width: 13px;
  height: 13px;
  accent-color: var(--primary);
}

.console-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
}

.console-button {
  height: 46px;
  padding: 0 20px;
  border: 1px solid var(--border-dark);
  color: var(--text-1);
  font-family: var(--font-mono);
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.12em;
  transition: transform var(--dur-2) var(--ease-out-expo), background var(--dur-2) ease, color var(--dur-2) ease;
}

.console-button.primary,
.console-button:hover:not(:disabled) {
  background: var(--text-1);
  color: var(--text-inverse);
}

.console-button.primary:hover:not(:disabled) {
  background: var(--primary);
  border-color: var(--primary);
}

.console-button:hover:not(:disabled) {
  transform: translateY(-2px);
}

.console-button:disabled {
  cursor: wait;
  opacity: 0.45;
}

.console-message {
  max-width: 720px;
  font-size: 12px;
  letter-spacing: 0.04em;
}

.console-message.success {
  color: var(--primary);
}

.console-message.error {
  color: #b00020;
}

.signal-board {
  border-top: 1px solid var(--border-dark);
  padding-top: 18px;
  display: grid;
  gap: 14px;
}

.signal-line {
  height: 34px;
  display: grid;
  grid-template-columns: repeat(34, 1fr);
  align-items: end;
  gap: 4px;
}

.signal-line span {
  height: 10px;
  background: var(--primary);
  transform-origin: bottom;
  animation: signalLift 2.4s ease-in-out infinite;
}

.signal-line span:nth-child(3n) {
  height: 18px;
  background: var(--text-1);
}

.signal-line span:nth-child(5n) {
  height: 26px;
}

.signal-metrics {
  display: flex;
  flex-wrap: wrap;
  gap: 10px 28px;
  color: var(--text-3);
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.1em;
}

@keyframes signalLift {
  0%, 100% { transform: scaleY(0.35); opacity: 0.35; }
  45% { transform: scaleY(1); opacity: 1; }
}

@keyframes nodePulse {
  0%, 100% { opacity: 0.35; transform: scale(0.8); }
  50% { opacity: 1; transform: scale(1); }
}

@media (max-width: 880px) {
  .model-config-os {
    grid-template-columns: 1fr;
    overflow: auto;
  }

  .config-rail {
    min-height: auto;
    border-right: none;
    border-bottom: 1px solid var(--border-dark);
  }

  .config-stage {
    min-height: auto;
    padding: 40px 24px 56px;
  }

  .config-field {
    grid-template-columns: 1fr;
    gap: 8px;
  }

  .mini-field-grid {
    grid-template-columns: 1fr;
  }

  .stage-header h2 {
    font-size: clamp(2.6rem, 16vw, 5rem);
  }
}
</style>
