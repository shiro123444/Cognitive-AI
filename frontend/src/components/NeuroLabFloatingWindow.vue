<script setup>
import { computed, onBeforeUnmount, ref } from 'vue';

const props = defineProps({
  title: {
    type: String,
    required: true
  },
  subtitle: {
    type: String,
    default: ''
  },
  dock: {
    type: String,
    default: 'top-left',
    validator: (value) => ['top-left', 'top-right', 'bottom-left', 'bottom-right'].includes(value)
  },
  expanded: {
    type: Boolean,
    default: false
  },
  compact: {
    type: Boolean,
    default: false
  }
});

const emit = defineEmits(['update:dock', 'update:expanded']);

const dragState = ref(null);
const dockClass = computed(() => `dock-${props.dock}`);

function setDock(nextDock) {
  emit('update:dock', nextDock);
}

function toggleExpanded() {
  emit('update:expanded', !props.expanded);
}

function onPointerMove(event) {
  if (!dragState.value) return;

  dragState.value = {
    ...dragState.value,
    x: event.clientX,
    y: event.clientY
  };
}

function cleanupDragListeners() {
  window.removeEventListener('pointermove', onPointerMove);
  window.removeEventListener('pointerup', onPointerUp);
}

function onPointerUp() {
  if (!dragState.value) return;

  const viewportWidth = window.innerWidth || 1280;
  const viewportHeight = window.innerHeight || 720;
  const horizontal = dragState.value.x > viewportWidth / 2 ? 'right' : 'left';
  const vertical = dragState.value.y > viewportHeight / 2 ? 'bottom' : 'top';

  emit('update:dock', `${vertical}-${horizontal}`);
  dragState.value = null;
  cleanupDragListeners();
}

function onPointerDown(event) {
  dragState.value = {
    x: event.clientX,
    y: event.clientY
  };

  window.addEventListener('pointermove', onPointerMove);
  window.addEventListener('pointerup', onPointerUp);
}

onBeforeUnmount(() => {
  cleanupDragListeners();
});
</script>

<template>
  <section
    class="lab-floating-window"
    :class="[dockClass, { expanded, compact, dragging: Boolean(dragState) }]"
  >
    <header class="lab-floating-window__header" @pointerdown="onPointerDown">
      <div class="lab-floating-window__heading">
        <p class="lab-floating-window__eyebrow">{{ title }}</p>
        <h3 v-if="subtitle">{{ subtitle }}</h3>
      </div>

      <div class="lab-floating-window__actions">
        <button data-testid="dock-top-left" type="button" @click.stop="setDock('top-left')">TL</button>
        <button data-testid="dock-top-right" type="button" @click.stop="setDock('top-right')">TR</button>
        <button data-testid="dock-bottom-left" type="button" @click.stop="setDock('bottom-left')">BL</button>
        <button data-testid="dock-bottom-right" type="button" @click.stop="setDock('bottom-right')">BR</button>
        <button data-testid="window-toggle" type="button" @click.stop="toggleExpanded">
          {{ expanded ? '收起' : '展开' }}
        </button>
      </div>
    </header>

    <div class="lab-floating-window__body">
      <slot />
    </div>
  </section>
</template>

<style scoped>
.lab-floating-window {
  position: absolute;
  z-index: 4;
  width: min(320px, calc(100vw - 32px));
  border: 1px solid var(--border-default);
  background: rgba(255, 255, 255, 0.94);
  backdrop-filter: blur(10px);
  transition:
    transform var(--dur-2) var(--ease-out-quint),
    border-color var(--dur-2) ease,
    box-shadow var(--dur-2) ease,
    width var(--dur-2) ease;
}

.lab-floating-window.expanded {
  width: min(420px, calc(100vw - 32px));
}

.lab-floating-window.dragging {
  border-color: var(--primary);
  box-shadow: 0 16px 40px rgba(0, 34, 255, 0.14);
}

.dock-top-left {
  top: 24px;
  left: 24px;
}

.dock-top-right {
  top: 24px;
  right: 24px;
}

.dock-bottom-left {
  bottom: 24px;
  left: 24px;
}

.dock-bottom-right {
  right: 24px;
  bottom: 24px;
}

.lab-floating-window__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  padding: 14px 16px 12px;
  border-bottom: 1px solid var(--border-default);
  cursor: grab;
}

.lab-floating-window__heading {
  min-width: 0;
}

.lab-floating-window__eyebrow {
  margin: 0 0 6px;
  color: var(--primary);
  font-family: var(--font-mono);
  font-size: 11px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

.lab-floating-window__header h3 {
  margin: 0;
  font-size: 15px;
  font-weight: 600;
}

.lab-floating-window__actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 6px;
}

.lab-floating-window__actions button {
  min-width: 34px;
  min-height: 28px;
  padding: 0 8px;
  border: 1px solid var(--border-default);
  background: var(--surface-0);
  font-size: 11px;
}

.lab-floating-window__body {
  padding: 14px 16px 16px;
}
</style>
