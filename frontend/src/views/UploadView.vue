<template>
  <main class="upload-page">
    <MaterialUploadStudio
      :course-id="activeCourseId"
      :scope-type="uploadScope.scopeType"
      :owner-id="uploadScope.ownerId"
      :mode="uploadScope.mode"
      @uploaded="onUploaded"
    />
  </main>
</template>

<script setup>
import { computed } from 'vue';
import { useRoute } from 'vue-router';
import MaterialUploadStudio from '../components/MaterialUploadStudio.vue';
import { materialUploadScopeFromRoute } from './uploadViewState';

const route = useRoute();

const activeCourseId = computed(() => {
  const v = route.query.course;
  return typeof v === 'string' ? v : 'ai-intro';
});

const uploadScope = computed(() => materialUploadScopeFromRoute(route.query));

function onUploaded(job) {
  console.log('[Upload] material processed:', job);
}
</script>

<style scoped>
.upload-page {
  min-height: calc(100vh - var(--nav-height));
  background: var(--surface-0);
}
</style>
