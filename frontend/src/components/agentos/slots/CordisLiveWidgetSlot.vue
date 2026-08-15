<template>
  <div class="slot-container cordis-widget-slot">
    <div class="slot-header">
      <div class="header-left">
        <span class="slot-badge badge-dyn">LIVE CORDIS PLUGIN</span>
        <span class="slot-title">{{ widgetData.name || '动态教育插件' }}</span>
      </div>
      <div class="header-right">
        <span class="dyn-id">{{ widgetData.dynId || 'dyn-hotplug' }}</span>
      </div>
    </div>

    <div class="widget-body">
      <div class="widget-desc">
        <strong>用途：</strong> {{ widgetData.purpose || '由 Agent 实时定义并挂载的内存级动态组件' }}
      </div>

      <!-- Live interactive sandbox preview -->
      <div class="live-sandbox-panel">
        <div class="sandbox-title">⚡ 运行时动态挂载状态</div>
        <div class="code-preview">
          <code>{{ codeSnippet }}</code>
        </div>
        <div class="status-indicator">
          <span class="pulse-dot"></span>
          <span>Fiber State: <strong>ACTIVE</strong> | 副作用完全受控可逆 (LIFO Disposer Ready)</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue';

const props = defineProps({
  data: {
    type: Object,
    default: () => ({}),
  },
});

const widgetData = computed(() => props.data || {});
const codeSnippet = computed(() => {
  return props.data?.toolCode || `// Dynamic Cordis Plugin Mounted at ${new Date().toLocaleTimeString()}
export default function apply(ctx) {
  ctx.on('neurolab/voxel:select', (voxel) => {
    ctx.logger.info('Live observer received voxel:', voxel);
  });
  return () => ctx.logger.info('Cleaned up dynamic fiber.');
}`;
});
</script>

<style scoped>
.slot-container {
  display: flex;
  flex-direction: column;
  background: var(--rk-white, #ffffff);
  border: 2px solid var(--rk-ink, #171713);
  box-shadow: 4px 4px 0 var(--rk-ink, #171713);
  border-radius: 4px;
  overflow: hidden;
}

.slot-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 14px;
  background: var(--rk-panel, #e4e3dc);
  border-bottom: 2px solid var(--rk-ink, #171713);
}

.badge-dyn {
  font-size: 9px;
  font-weight: 800;
  background: #171713;
  color: var(--rk-yellow, #d9b63f);
  padding: 2px 6px;
  border: 1.5px solid var(--rk-ink, #171713);
  margin-right: 8px;
}

.slot-title {
  font-weight: 800;
  font-size: 13px;
  color: var(--rk-ink, #171713);
}

.dyn-id {
  font-size: 10px;
  font-family: 'JetBrains Mono', monospace;
  font-weight: bold;
  background: var(--rk-white, #ffffff);
  border: 1.5px solid var(--rk-ink, #171713);
  padding: 2px 6px;
}

.widget-body {
  padding: 14px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.widget-desc {
  font-size: 11.5px;
  color: var(--rk-ink, #171713);
}

.live-sandbox-panel {
  background: #0f172a;
  color: #f8fafc;
  padding: 12px;
  border-radius: 4px;
  border: 1.5px solid var(--rk-ink, #171713);
}

.sandbox-title {
  font-size: 10px;
  font-weight: 700;
  color: #38bdf8;
  margin-bottom: 8px;
}

.code-preview {
  font-family: 'JetBrains Mono', monospace;
  font-size: 10px;
  line-height: 1.4;
  white-space: pre-wrap;
  background: #1e293b;
  padding: 8px;
  border-radius: 3px;
  margin-bottom: 8px;
}

.status-indicator {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 10px;
  color: #4ade80;
}

.pulse-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #4ade80;
  box-shadow: 0 0 6px #4ade80;
}
</style>
