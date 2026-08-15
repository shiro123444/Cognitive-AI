<template>
  <section class="model-config-os" :style="pointerStyle" @mousemove="trackPointer">
    <aside class="config-rail">
      <header class="rail-brand">
        <RouterLink to="/teacher" class="back-link btn btn-sm btn-subtle" aria-label="返回教师工作室">‹ 返回</RouterLink>
        <div>
          <h1>MODEL CONFIG</h1>
          <p class="mono">教师控制台 · LLM</p>
        </div>
      </header>

      <div class="rail-block">
        <div class="rail-head mono">
          <span>RUNTIME</span>
          <span class="status-tag" :class="{ ok: !loading }">{{ loading ? 'SYNC' : 'READY' }}</span>
        </div>
        <strong>{{ form.model || 'mimo-v2.5-pro' }}</strong>
        <small class="mono">{{ normalizedBaseUrl }}</small>
      </div>

      <div class="rail-block">
        <div class="rail-head mono">
          <span>SECRET</span>
          <span class="status-tag">{{ apiKeyStatus }}</span>
        </div>
        <strong class="mono">{{ settings.api_key_hint || 'NO KEY' }}</strong>
        <small>API Key 不会在页面回显</small>
      </div>

      <div class="rail-block">
        <div class="rail-head mono">
          <span>EMBEDDING</span>
          <span class="status-tag">{{ embeddingApiKeyStatus }}</span>
        </div>
        <strong>{{ embeddingForm.model || 'nvidia/nv-embed-v1' }}</strong>
        <small class="mono">{{ embeddingForm.base_url || 'https://integrate.api.nvidia.com/v1' }}</small>
      </div>

      <nav class="rail-links" aria-label="Teacher model configuration navigation">
        <RouterLink to="/teacher/edufish" class="btn btn-yellow btn-sm w-full">
          <span>EDUFISH 分析引擎</span>
          <i aria-hidden="true">→</i>
        </RouterLink>
        <RouterLink to="/teacher" class="btn btn-subtle btn-sm w-full">
          <span>TEACHER STUDIO</span>
          <i aria-hidden="true">→</i>
        </RouterLink>
      </nav>

      <footer class="rail-footer mono">
        <span class="sq sq-green" /> OPENAI-COMPATIBLE
      </footer>
    </aside>

    <main class="config-stage">
      <header class="stage-header hero-banner">
        <p class="mono kicker">LLM GATEWAY / EDUCATION AGENTS</p>
        <h2 class="hero-banner-title">模型接入参数配置</h2>
      </header>

      <div class="config-grid">
        <form class="config-console panel" @submit.prevent="saveSettings">
          <div class="console-title mono">
            <span class="sq sq-pink" />
            <strong>CHAT LLM</strong>
            <small>回答生成模型</small>
          </div>

          <label class="form-field">
            <span class="field-label mono">BASE URL</span>
            <input
              v-model.trim="form.base_url"
              type="url"
              autocomplete="off"
              spellcheck="false"
              placeholder="https://api.xiaomimimo.com/v1"
              class="form-control"
            />
          </label>

          <label class="form-field">
            <span class="field-label mono">MODEL NAME</span>
            <input
              v-model.trim="form.model"
              type="text"
              autocomplete="off"
              spellcheck="false"
              placeholder="mimo-v2.5-pro"
              class="form-control"
            />
          </label>

          <label class="form-field">
            <span class="field-label mono">API KEY</span>
            <input
              v-model.trim="form.api_key"
              type="password"
              autocomplete="new-password"
              spellcheck="false"
              :placeholder="apiKeyPlaceholder"
              class="form-control"
            />
          </label>

          <label class="clear-key-line mono">
            <input v-model="form.clear_api_key" type="checkbox" />
            <span>清除当前密钥</span>
          </label>

          <div class="console-actions">
            <button type="submit" class="btn btn-primary" :disabled="saving">
              {{ saving ? '写入中…' : '保存配置' }} <span aria-hidden="true">→</span>
            </button>
            <button type="button" class="btn btn-yellow" :disabled="testing" @click="runConnectionTest">
              {{ testing ? '测试中…' : '连通测试' }} <span aria-hidden="true">→</span>
            </button>
          </div>

          <p v-if="message" class="console-message success mono"><span class="sq on" /> {{ message }}</p>
          <p v-if="error" class="console-message error mono"><span class="sq off" /> {{ error }}</p>
        </form>

        <form class="config-console embedding-console panel" @submit.prevent="saveEmbeddingSettings">
          <div class="console-title mono">
            <span class="sq sq-cyan" />
            <strong>EMBEDDING ENGINE</strong>
            <small>RAG 向量检索模型</small>
          </div>

          <label class="form-field">
            <span class="field-label mono">BASE URL</span>
            <input
              v-model.trim="embeddingForm.base_url"
              type="url"
              autocomplete="off"
              spellcheck="false"
              placeholder="https://integrate.api.nvidia.com/v1"
              class="form-control"
            />
          </label>

          <label class="form-field">
            <span class="field-label mono">MODEL NAME</span>
            <input
              v-model.trim="embeddingForm.model"
              type="text"
              autocomplete="off"
              spellcheck="false"
              placeholder="nvidia/nv-embed-v1"
              class="form-control"
            />
          </label>

          <label class="form-field">
            <span class="field-label mono">API KEY</span>
            <input
              v-model.trim="embeddingForm.api_key"
              type="password"
              autocomplete="new-password"
              spellcheck="false"
              :placeholder="embeddingApiKeyPlaceholder"
              class="form-control"
            />
          </label>

          <label class="clear-key-line mono">
            <input v-model="embeddingForm.clear_api_key" type="checkbox" />
            <span>清除当前嵌入密钥</span>
          </label>

          <div class="console-actions">
            <button type="submit" class="btn btn-primary" :disabled="embeddingSaving">
              {{ embeddingSaving ? '写入中…' : '保存嵌入配置' }} <span aria-hidden="true">→</span>
            </button>
            <button type="button" class="btn btn-cyan" :disabled="embeddingTesting" @click="runEmbeddingConnectionTest">
              {{ embeddingTesting ? '测试中…' : '嵌入连通测试' }} <span aria-hidden="true">→</span>
            </button>
          </div>

          <p v-if="embeddingMessage" class="console-message success mono"><span class="sq on" /> {{ embeddingMessage }}</p>
          <p v-if="embeddingError" class="console-message error mono"><span class="sq off" /> {{ embeddingError }}</p>
        </form>
      </div>
    </main>
  </section>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from 'vue';
import {
  getLlmSettings,
  updateLlmSettings,
  testLlmSettings,
  getEmbeddingSettings,
  updateEmbeddingSettings,
  testEmbeddingSettings
} from '../api/settings';

const loading = ref(true);
const saving = ref(false);
const testing = ref(false);
const message = ref('');
const error = ref('');

const embeddingSaving = ref(false);
const embeddingTesting = ref(false);
const embeddingMessage = ref('');
const embeddingError = ref('');

const settings = ref({});
const form = reactive({
  base_url: '',
  model: '',
  api_key: '',
  clear_api_key: false
});

const embeddingForm = reactive({
  base_url: '',
  model: '',
  api_key: '',
  clear_api_key: false
});

const pointer = reactive({ x: 0, y: 0 });

function trackPointer(e) {
  pointer.x = (e.clientX / window.innerWidth - 0.5) * 2;
  pointer.y = (e.clientY / window.innerHeight - 0.5) * 2;
}

const pointerStyle = computed(() => ({
  '--ptr-x': pointer.x,
  '--ptr-y': pointer.y
}));

const normalizedBaseUrl = computed(() => form.base_url || 'https://api.xiaomimimo.com/v1');
const apiKeyStatus = computed(() => (settings.value.api_key_configured ? 'CONFIGURED' : 'UNSET'));
const apiKeyPlaceholder = computed(() => (settings.value.api_key_configured ? '••••••••' : '输入 API 密钥'));
const embeddingApiKeyStatus = computed(() => (settings.value.embedding_api_key_configured ? 'CONFIGURED' : 'UNSET'));
const embeddingApiKeyPlaceholder = computed(() => (settings.value.embedding_api_key_configured ? '••••••••' : '输入 Embedding API 密钥'));

async function load() {
  loading.value = true;
  try {
    const [llmData, embData] = await Promise.all([
      getLlmSettings().catch(() => ({})),
      getEmbeddingSettings().catch(() => ({}))
    ]);
    const merged = { ...llmData, ...embData };
    settings.value = merged;
    form.base_url = llmData?.base_url || llmData?.llm_base_url || '';
    form.model = llmData?.model || llmData?.llm_model || '';
    embeddingForm.base_url = embData?.base_url || embData?.embedding_base_url || '';
    embeddingForm.model = embData?.model || embData?.embedding_model || '';
  } catch (err) {
    error.value = err?.message || '加载配置失败';
  } finally {
    loading.value = false;
  }
}

async function saveSettings() {
  saving.value = true;
  message.value = '';
  error.value = '';
  try {
    const patch = {
      base_url: form.base_url,
      model: form.model
    };
    if (form.clear_api_key) {
      patch.api_key = '';
    } else if (form.api_key) {
      patch.api_key = form.api_key;
    }
    const updated = await updateLlmSettings(patch);
    settings.value = { ...settings.value, ...updated };
    form.api_key = '';
    form.clear_api_key = false;
    message.value = 'Chat LLM 配置已成功更新。';
  } catch (err) {
    error.value = err?.message || '保存 Chat LLM 配置失败';
  } finally {
    saving.value = false;
  }
}

async function runConnectionTest() {
  testing.value = true;
  message.value = '';
  error.value = '';
  try {
    const res = await testLlmSettings({
      base_url: form.base_url,
      model: form.model,
      api_key: form.api_key || undefined
    });
    message.value = res?.message || 'Chat LLM 连通性测试通过！';
  } catch (err) {
    error.value = err?.message || 'Chat LLM 连通测试失败';
  } finally {
    testing.value = false;
  }
}

async function saveEmbeddingSettings() {
  embeddingSaving.value = true;
  embeddingMessage.value = '';
  embeddingError.value = '';
  try {
    const patch = {
      base_url: embeddingForm.base_url,
      model: embeddingForm.model
    };
    if (embeddingForm.clear_api_key) {
      patch.api_key = '';
    } else if (embeddingForm.api_key) {
      patch.api_key = embeddingForm.api_key;
    }
    const updated = await updateEmbeddingSettings(patch);
    settings.value = { ...settings.value, ...updated };
    embeddingForm.api_key = '';
    embeddingForm.clear_api_key = false;
    embeddingMessage.value = 'Embedding 配置已成功更新。';
  } catch (err) {
    embeddingError.value = err?.message || '保存 Embedding 配置失败';
  } finally {
    embeddingSaving.value = false;
  }
}

async function runEmbeddingConnectionTest() {
  embeddingTesting.value = true;
  embeddingMessage.value = '';
  embeddingError.value = '';
  try {
    const res = await testEmbeddingSettings({
      base_url: embeddingForm.base_url,
      model: embeddingForm.model,
      api_key: embeddingForm.api_key || undefined
    });
    embeddingMessage.value = res?.message || 'Embedding 连通性测试通过！';
  } catch (err) {
    embeddingError.value = err?.message || 'Embedding 连通测试失败';
  } finally {
    embeddingTesting.value = false;
  }
}

onMounted(load);
</script>

<style scoped>
.model-config-os {
  min-height: calc(100vh - var(--nav-height));
  background: var(--rk-bg);
  color: var(--rk-ink);
  display: grid;
  grid-template-columns: 280px 1fr;
}

.config-rail {
  background: var(--rk-panel);
  border-right: 2px solid var(--rk-ink);
  padding: 24px 20px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.rail-brand {
  display: flex;
  align-items: center;
  gap: 10px;
  border-bottom: 2px solid var(--rk-ink);
  padding-bottom: 12px;
}

.rail-brand h1 {
  font-size: 14px;
  font-weight: 900;
  margin: 0;
  letter-spacing: 0.05em;
}

.rail-brand p {
  font-size: 11px;
  color: var(--rk-muted);
  margin: 2px 0 0;
}

.rail-block {
  padding: 12px;
  background: var(--rk-white);
  border: 1.5px solid var(--rk-ink);
  box-shadow: 1px 1px 0 var(--rk-ink);
  display: grid;
  gap: 4px;
}

.rail-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 10px;
  font-weight: 800;
  color: var(--rk-muted);
}

.status-tag {
  padding: 1px 4px;
  background: var(--rk-panel);
  border: 1px solid var(--rk-ink);
  font-size: 9px;
  font-weight: 700;
}

.status-tag.ok {
  background: var(--rk-green);
}

.rail-block strong {
  font-size: 12.5px;
  font-weight: 800;
}

.rail-block small {
  font-size: 10.5px;
  color: var(--rk-muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.rail-links {
  margin-top: auto;
  display: grid;
  gap: 8px;
}

.w-full {
  width: 100%;
}

.rail-footer {
  font-size: 10.5px;
  font-weight: 800;
  display: flex;
  align-items: center;
  gap: 6px;
  color: var(--rk-muted);
  border-top: 1px solid var(--rk-ink);
  padding-top: 12px;
}

.config-stage {
  padding: 24px var(--shell-pad-x);
  display: grid;
  gap: 20px;
  align-content: start;
}

.config-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 24px;
}

.config-console {
  display: grid;
  gap: 16px;
  align-content: start;
}

.console-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  font-weight: 900;
  border-bottom: 2px solid var(--rk-ink);
  padding-bottom: 8px;
}

.console-title small {
  margin-left: auto;
  font-size: 11px;
  color: var(--rk-muted);
  font-weight: normal;
}

.clear-key-line {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
}

.console-actions {
  display: flex;
  gap: 10px;
  margin-top: 8px;
}

.console-message {
  padding: 8px 12px;
  border: 1.5px solid var(--rk-ink);
  font-size: 12px;
  font-weight: 700;
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 0;
}

.console-message.success {
  background: var(--rk-green);
}

.console-message.error {
  background: var(--rk-orange);
}

@media (max-width: 960px) {
  .model-config-os {
    grid-template-columns: 1fr;
  }
  .config-grid {
    grid-template-columns: 1fr;
  }
}
</style>
