<script setup>
import { computed } from 'vue';

const props = defineProps({
  regions: { type: Array, default: () => [] },
  band: { type: String, default: 'alpha' }
});

function valueOf(region) {
  if (props.band === 'beta') return region.beta ?? 0;
  if (props.band === 'total') return (region.alpha ?? 0) + (region.beta ?? 0);
  return region.alpha ?? 0;
}

const maxValue = computed(() => Math.max(1, ...props.regions.map(valueOf)));
</script>

<template>
  <svg viewBox="0 0 100 100" class="scalp" preserveAspectRatio="xMidYMid meet" data-testid="scalp-topo">
    <defs>
      <radialGradient id="scalp-halo">
        <stop offset="0%" stop-color="var(--primary)" stop-opacity="0.75" />
        <stop offset="60%" stop-color="var(--primary)" stop-opacity="0.22" />
        <stop offset="100%" stop-color="var(--primary)" stop-opacity="0" />
      </radialGradient>
    </defs>

    <!-- head outline + nose + ears -->
    <circle cx="50" cy="50" r="42" class="scalp__head" />
    <path d="M 43 9 Q 50 3 57 9" class="scalp__feature" />
    <path d="M 8 44 Q 4 50 8 56" class="scalp__feature" />
    <path d="M 92 44 Q 96 50 92 56" class="scalp__feature" />

    <!-- band-power heat halos (radius scales with relative power) -->
    <circle
      v-for="r in regions"
      :key="(r.id || r.label) + '-halo'"
      :cx="r.screen?.x ?? 50"
      :cy="r.screen?.y ?? 50"
      :r="8 + 14 * (valueOf(r) / maxValue)"
      fill="url(#scalp-halo)"
    />

    <!-- electrode dots + labels -->
    <circle
      v-for="r in regions"
      :key="(r.id || r.label) + '-dot'"
      :cx="r.screen?.x ?? 50"
      :cy="r.screen?.y ?? 50"
      r="2.4"
      class="scalp__electrode"
    />
    <text
      v-for="r in regions"
      :key="(r.id || r.label) + '-label'"
      :x="r.screen?.x ?? 50"
      :y="(r.screen?.y ?? 50) + 9"
      class="scalp__label"
    >{{ r.shortLabel || r.label }}</text>
  </svg>
</template>

<style scoped>
.scalp {
  width: 100%;
  height: 100%;
  display: block;
}

.scalp__head {
  fill: var(--surface-1);
  stroke: var(--border-strong);
  stroke-width: 1;
}

.scalp__feature {
  fill: none;
  stroke: var(--border-strong);
  stroke-width: 1;
}

.scalp__electrode {
  fill: var(--text-1);
}

.scalp__label {
  font-family: var(--font-mono);
  font-size: 5px;
  fill: var(--text-2);
  text-anchor: middle;
}
</style>
