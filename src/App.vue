<script setup lang="ts">
import { computed, ref } from "vue";
import CheckDeskPage from "./pages/CheckDeskPage.vue";
import HandoffLogsPage from "./pages/HandoffLogsPage.vue";
import { useHandoverStore } from "./store/handoverStore";

const store = useHandoverStore();

const tabs = [
  { hash: "#/desk", label: "交班核对台" },
  { hash: "#/logs", label: "交班记录" },
] as const;

const current = ref(window.location.hash || "#/desk");
window.addEventListener("hashchange", () => {
  current.value = window.location.hash || "#/desk";
});

const page = computed(() => (current.value.startsWith("#/logs") ? "logs" : "desk"));
</script>

<template>
  <main class="app">
    <div class="shell">
      <header class="topbar">
        <div>
          <p class="eyebrow">骑手晚间换班</p>
          <h1>交班核对台</h1>
          <p class="subtitle">
            先核平代收现金，再按剩余路线顺序与车上冷冻格容量确认能否承接；
            现金有差额停在班长复核，放行后才完成换班。装不下的冷链单留在原骑手并写明原因。
          </p>
        </div>
        <div class="stack">
          <span class="tag">应收/实交逐单核现金</span>
          <span class="tag">站序装格</span>
          <span class="tag">班长放行闸门</span>
        </div>
      </header>

      <nav class="tabs">
        <a
          v-for="tab in tabs"
          :key="tab.hash"
          :href="tab.hash"
          :class="['tab', { on: current.startsWith(tab.hash) }]"
        >
          {{ tab.label }}
          <em v-if="tab.hash === '#/logs' && store.logs.length">{{ store.logs.length }}</em>
        </a>
      </nav>

      <component :is="page === 'logs' ? HandoffLogsPage : CheckDeskPage" />
    </div>
  </main>
</template>
