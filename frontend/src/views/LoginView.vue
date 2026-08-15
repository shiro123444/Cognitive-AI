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
  { label: '管理员', username: 'admin', password: 'admin123', role: 'admin', color: 'yellow' },
  { label: '教师', username: 'teacher1', password: 'teacher123', role: 'teacher', color: 'cyan' },
  { label: '学生', username: 'student1', password: 'student123', role: 'student', color: 'green' }
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
          <span class="brand-mark">
            <i class="sq-yellow" />
            <i class="sq-pink" />
            <i class="sq-cyan" />
            <i class="sq-green" />
          </span>
          <span class="brand-text">EDUFISH</span>
        </div>
        <h1 class="aside-title">智能教育分析引擎</h1>
        <p class="aside-sub">面向人工智能导论与脑认知科学导论，为教师、学生与管理员提供差异化教学实验工作台。</p>

        <div class="aside-demo">
          <div class="aside-demo-title mono">
            <span class="sq sq-yellow" /> 快速演示账号 (点击填入)
          </div>
          <ul class="demo-list">
            <li
              v-for="account in demoAccounts"
              :key="account.username"
              class="demo-row"
            >
              <button type="button" class="demo-btn" @click="fillDemo(account)">
                <span class="demo-role" :class="account.color">{{ account.label }}</span>
                <code class="demo-creds mono">{{ account.username }} / {{ account.password }}</code>
              </button>
            </li>
          </ul>
        </div>
      </aside>

      <section class="login-panel">
        <header class="panel-head">
          <h2 class="panel-title">
            <span class="sq sq-pink" /> 账号登录
          </h2>
          <p class="panel-sub">请使用你的系统账号继续操作</p>
        </header>

        <form class="login-form" @submit.prevent="submit" autocomplete="on">
          <label class="field">
            <span class="field-label">用户名</span>
            <input
              v-model="form.username"
              type="text"
              autocomplete="username"
              required
              placeholder="例如 teacher1 或 student1"
              class="form-control"
            />
          </label>

          <label class="field">
            <span class="field-label">密码</span>
            <input
              v-model="form.password"
              type="password"
              autocomplete="current-password"
              required
              placeholder="••••••••"
              class="form-control"
            />
          </label>

          <p v-if="errorMessage" class="form-error" role="alert">
            <span class="sq sq-orange" /> {{ errorMessage }}
          </p>

          <button type="submit" class="btn btn-primary btn-lg submit-btn" :disabled="submitting">
            <span v-if="!submitting">进入系统 →</span>
            <span v-else>验证中…</span>
          </button>
        </form>

        <footer class="panel-foot">
          <span>无账号？请联系平台教研管理员或直接点击左侧演示账号体验。</span>
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
  background: var(--rk-bg);
  padding: 32px 20px;
}

.login-stage {
  display: grid;
  grid-template-columns: 1.1fr 1fr;
  width: min(100%, 940px);
  background: var(--rk-panel);
  border: 2px solid var(--rk-ink);
  box-shadow: 6px 6px 0 var(--rk-ink);
  overflow: hidden;
}

.login-aside {
  background: var(--rk-panel);
  border-right: 2px solid var(--rk-ink);
  padding: 48px 40px;
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.brand {
  display: flex;
  align-items: center;
  gap: 12px;
}

.brand-mark {
  display: grid;
  grid-template-columns: 8px 8px;
  gap: 3px;
  width: 19px;
  height: 19px;
}

.brand-mark i {
  display: block;
  width: 8px;
  height: 8px;
  border: 1.5px solid var(--rk-ink);
}

.sq-yellow { background: var(--rk-yellow); }
.sq-pink { background: var(--rk-pink); }
.sq-cyan { background: var(--rk-cyan); }
.sq-green { background: var(--rk-green); }
.sq-orange { background: var(--rk-orange); }

.brand-text {
  font-family: var(--font-display);
  font-weight: 900;
  font-size: 20px;
  color: var(--rk-ink);
  letter-spacing: 0.08em;
}

.aside-title {
  font-family: var(--font-display);
  font-size: clamp(24px, 2.5vw, 32px);
  font-weight: 900;
  color: var(--rk-ink);
  margin: 0;
  line-height: 1.15;
}

.aside-sub {
  color: var(--rk-ink);
  line-height: 1.6;
  font-size: 14px;
  margin: 0;
}

.aside-demo {
  margin-top: auto;
  border-top: 2px solid var(--rk-ink);
  padding-top: 18px;
}

.aside-demo-title {
  font-size: 12px;
  font-weight: 800;
  color: var(--rk-ink);
  margin-bottom: 12px;
  display: flex;
  align-items: center;
  gap: 6px;
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
  padding: 8px 12px;
  background: var(--rk-white);
  border: 1.5px solid var(--rk-ink);
  box-shadow: 2px 2px 0 var(--rk-ink);
  cursor: pointer;
  text-align: left;
  transition: transform 0.05s, box-shadow 0.05s, background 0.1s;
}

.demo-btn:hover {
  transform: translate(1px, 1px);
  box-shadow: 1px 1px 0 var(--rk-ink);
  background: var(--rk-panel);
}

.demo-role {
  font-weight: 800;
  font-size: 12.5px;
  padding: 2px 6px;
  border: 1px solid var(--rk-ink);
}

.demo-role.yellow { background: var(--rk-yellow); }
.demo-role.cyan { background: var(--rk-cyan); }
.demo-role.green { background: var(--rk-green); }

.demo-creds {
  font-size: 12px;
  color: var(--rk-ink);
  font-weight: 700;
}

.login-panel {
  background: var(--rk-white);
  padding: 48px 40px;
  display: flex;
  flex-direction: column;
  gap: 28px;
}

.panel-head h2 {
  font-family: var(--font-display);
  font-size: 24px;
  font-weight: 900;
  color: var(--rk-ink);
  margin: 0 0 6px;
  display: flex;
  align-items: center;
  gap: 8px;
}

.panel-sub {
  margin: 0;
  font-size: 13px;
  color: var(--rk-muted);
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
  font-size: 12px;
  font-weight: 800;
  color: var(--rk-ink);
}

.form-error {
  margin: 0;
  font-size: 13px;
  color: var(--rk-ink);
  border: 1.5px solid var(--rk-ink);
  padding: 8px 12px;
  background: var(--rk-orange);
  font-weight: 700;
  display: flex;
  align-items: center;
  gap: 6px;
}

.submit-btn {
  width: 100%;
  margin-top: 6px;
}

.panel-foot {
  margin-top: auto;
  padding-top: 14px;
  border-top: 1.5px dashed var(--rk-ink);
  font-size: 12px;
  color: var(--rk-muted);
  line-height: 1.5;
}

@media (max-width: 860px) {
  .login-stage {
    grid-template-columns: 1fr;
  }
  .login-aside {
    border-right: none;
    border-bottom: 2px solid var(--rk-ink);
    padding: 32px 24px;
  }
  .login-panel {
    padding: 32px 24px;
  }
}
</style>
