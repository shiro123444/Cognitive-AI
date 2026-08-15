<script setup>
import AppShell from './components/AppShell.vue';
</script>

<template>
  <AppShell>
    <RouterView v-slot="{ Component, route }">
      <transition name="pixel-route" mode="out-in">
        <component :is="Component" :key="route.path" />
      </transition>
    </RouterView>
  </AppShell>
</template>
