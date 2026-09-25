<script setup lang="ts">
import { ref } from "vue";
import HandoverWorkbench from "./pages/HandoverWorkbench.vue";
import HandoverRecords from "./pages/HandoverRecords.vue";

const active = ref<"workbench" | "records">("workbench");
</script>

<template>
  <main class="app">
    <div class="shell">
      <header class="topbar">
        <div>
          <p class="eyebrow">夜间换班 · 现金与冷链交接</p>
          <h1>交班核对台</h1>
          <p class="subtitle">
            交班骑手先清点各单已收现金并核平；现金有差额时停在班长复核，放行后才能继续。
            再按剩余路线站点顺序、结合接班车冷冻格容量逐单确认，装不下的冷链单留在原骑手并写明原因，最后封存交班记录。
          </p>
        </div>
        <div class="stack">
          <span class="tag">先核现金</span>
          <span class="tag">班长复核闸门</span>
          <span class="tag">路线顺序 + 冷冻格</span>
        </div>
      </header>

      <el-tabs v-model="active" class="page-tabs">
        <el-tab-pane label="交班核对台" name="workbench">
          <HandoverWorkbench v-if="active === 'workbench'" />
        </el-tab-pane>
        <el-tab-pane label="交班记录" name="records">
          <HandoverRecords v-if="active === 'records'" />
        </el-tab-pane>
      </el-tabs>
    </div>
  </main>
</template>
