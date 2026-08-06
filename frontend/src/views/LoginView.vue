<script setup>
import { onMounted, reactive, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';

import { useAuthStore } from '../stores/auth';

const route = useRoute();
const router = useRouter();
const auth = useAuthStore();

const form = reactive({ username: '', password: '' });
const submitting = ref(false);
const errorMessage = ref('');

const demoAccounts = [
  { label: '管理员', username: 'admin', password: 'admin123', role: 'admin' },
  { label: '教师', username: 'teacher1', password: 'teacher123', role: 'teacher' },
  { label: '学生', username: 'student1', password: 'student123', role: 'student' }
];

function fillDemo(account) {
  form.username = account.username;
  form.password = account.password;
  errorMessage.value = '';
}

async function submit() {
  if (submitting.value) return;
  errorMessage.value = '';
  submitting.value = true;
  try {
    await auth.login({ username: form.username.trim(), password: form.password });
    const redirect = typeof route.query.redirect === 'string' ? route.query.redirect : '';
    const target = redirect || auth.homeRouteForCurrentRole();
    router.replace(target);
  } catch (err) {
    errorMessage.value = err?.message || '登录失败，请重试';
  } finally {
    submitting.value = false;
  }
}

onMounted(() => {
  if (auth.isAuthenticated) {
    router.replace(auth.homeRouteForCurrentRole());
  }
});
</script>

<template>
  <main class="login-shell">
    <div class="login-stage">
      <aside class="login-aside">
        <div class="brand">
          <div class="brand-icon">
            <span class="shape square"></span>
            <span class="shape circle"></span>
          </div>
          <span class="brand-text">EDUFISH</span>
        </div>
        <h1 class="aside-title">智能教育分析引擎</h1>
        <p class="aside-sub">面向人工智能导论与脑与认知科学导论。<br />为教师、学生与管理员提供差异化工作台。</p>

        <div class="aside-demo">
          <div class="aside-demo-title">演示账号</div>
          <ul class="demo-list">
            <li
              v-for="account in demoAccounts"
              :key="account.username"
              class="demo-row"
            >
              <button type="button" class="demo-btn" @click="fillDemo(account)">
                <span class="demo-role">{{ account.label }}</span>
                <code class="demo-creds">{{ account.username }} / {{ account.password }}</code>
              </button>
            </li>
          </ul>
        </div>
      </aside>

      <section class="login-panel">
        <header class="panel-head">
          <h2 class="panel-title">登录</h2>
          <p class="panel-sub">请使用你的账号继续</p>
        </header>

        <form class="login-form" @submit.prevent="submit" autocomplete="on">
          <label class="field">
            <span class="field-label">用户名</span>
            <input
              v-model="form.username"
              type="text"
              autocomplete="username"
              required
              placeholder="例如 teacher1"
              class="field-input"
            />
          </label>

          <label class="field">
            <span class="field-label">密码</span>
            <input
              v-model="form.password"
              type="password"
              autocomplete="current-password"
              required
              placeholder="••••••"
              class="field-input"
            />
          </label>

          <p v-if="errorMessage" class="form-error" role="alert">{{ errorMessage }}</p>

          <button type="submit" class="submit-btn" :disabled="submitting">
            <span v-if="!submitting">登录</span>
            <span v-else>登录中…</span>
          </button>
        </form>

        <footer class="panel-foot">
          <span>无账号？联系平台管理员或使用演示账号体验。</span>
        </footer>
      </section>
    </div>
  </main>
</template>

<style scoped>
.login-shell {
  min-height: 100vh;
  display: grid;
  place-items: center;
  background: var(--surface-0);
  padding: 32px 24px;
}

.login-stage {
  display: grid;
  grid-template-columns: 1.05fr 1fr;
  width: min(100%, 980px);
  background: var(--surface-1);
  border: 1px solid var(--border-subtle);
  overflow: hidden;
}

.login-aside {
  background: var(--surface-2, #f5f5f5);
  padding: 56px 48px;
  display: flex;
  flex-direction: column;
  gap: 28px;
}

.brand {
  display: flex;
  align-items: center;
  gap: 14px;
}

.brand-icon {
  position: relative;
  width: 28px;
  height: 28px;
}

.shape {
  position: absolute;
}

.shape.square {
  width: 18px;
  height: 18px;
  border: 1px solid var(--text-1);
  top: 0;
  left: 0;
}

.shape.circle {
  width: 14px;
  height: 14px;
  background: var(--primary);
  border-radius: 50%;
  bottom: 0;
  right: 0;
}

.brand-text {
  font-family: var(--font-display);
  font-weight: 700;
  font-size: 20px;
  color: var(--text-1);
  letter-spacing: 0.18em;
}

.aside-title {
  font-family: var(--font-display);
  font-size: clamp(28px, 3vw, 36px);
  font-weight: 700;
  color: var(--text-1);
  letter-spacing: -0.02em;
  margin: 0;
  line-height: 1.15;
}

.aside-sub {
  color: var(--text-3);
  line-height: 1.55;
  font-size: 14px;
  margin: 0;
}

.aside-demo {
  margin-top: auto;
  border-top: 1px solid var(--border-subtle);
  padding-top: 20px;
}

.aside-demo-title {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.18em;
  color: var(--text-3);
  margin-bottom: 12px;
}

.demo-list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: grid;
  gap: 8px;
}

.demo-btn {
  width: 100%;
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 12px;
  background: var(--surface-1);
  border: 1px solid var(--border-subtle);
  cursor: pointer;
  text-align: left;
  transition: border-color var(--dur-2) ease, transform var(--dur-2) ease;
}

.demo-btn:hover {
  border-color: var(--text-1);
  transform: translateY(-1px);
}

.demo-role {
  font-weight: 600;
  font-size: 13px;
  color: var(--text-1);
}

.demo-creds {
  font-family: var(--font-mono, 'JetBrains Mono', monospace);
  font-size: 12px;
  color: var(--text-3);
}

.login-panel {
  padding: 56px 48px;
  display: flex;
  flex-direction: column;
  gap: 32px;
}

.panel-head h2 {
  font-family: var(--font-display);
  font-size: 28px;
  font-weight: 700;
  color: var(--text-1);
  margin: 0 0 6px;
  letter-spacing: -0.01em;
}

.panel-sub {
  margin: 0;
  font-size: 13px;
  color: var(--text-3);
}

.login-form {
  display: grid;
  gap: 18px;
}

.field {
  display: grid;
  gap: 6px;
}

.field-label {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: var(--text-3);
}

.field-input {
  background: var(--surface-1);
  border: 1px solid var(--border-subtle);
  padding: 12px 14px;
  font-size: 14px;
  color: var(--text-1);
  transition: border-color var(--dur-2) ease;
  font-family: inherit;
}

.field-input:focus {
  outline: none;
  border-color: var(--text-1);
}

.form-error {
  margin: 0;
  font-size: 13px;
  color: var(--status-error);
  border-left: 2px solid var(--status-error);
  padding: 6px 10px;
  background: rgba(179, 38, 30, 0.06);
}

.submit-btn {
  margin-top: 4px;
  background: var(--text-1);
  color: var(--text-inverse, #fff);
  font-weight: 600;
  font-size: 13px;
  letter-spacing: 0.08em;
  height: 48px;
  border: none;
  cursor: pointer;
  transition: opacity var(--dur-2) ease;
}

.submit-btn:hover:not(:disabled) {
  opacity: 0.9;
}

.submit-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.panel-foot {
  margin-top: auto;
  padding-top: 16px;
  border-top: 1px solid var(--border-subtle);
  font-size: 12px;
  color: var(--text-3);
}

@media (max-width: 900px) {
  .login-stage {
    grid-template-columns: 1fr;
  }

  .login-aside {
    padding: 40px 32px 32px;
  }

  .login-panel {
    padding: 40px 32px;
  }

  .aside-demo {
    margin-top: 24px;
  }
}
</style>
