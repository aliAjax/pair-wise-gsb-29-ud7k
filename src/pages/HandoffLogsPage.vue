<script setup lang="ts">
// 交班记录页（页面层）：只读展示历次交班，含现金差额、班长放行意见、留单原因。
import { computed, ref } from "vue";
import { formatYuan } from "../domain/cash";
import { useHandoverStore } from "../store/handoverStore";

const store = useHandoverStore();
const expanded = ref<Set<string>>(new Set());
const onlyShortage = ref(false);

const filteredLogs = computed(() =>
  onlyShortage.value
    ? store.logs.filter((l) => l.cash.diffCents !== 0)
    : store.logs,
);

function toggle(id: string) {
  const next = new Set(expanded.value);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  expanded.value = next;
}

function nameOf(entry: { riderNames: Record<string, string> }, id: string) {
  return entry.riderNames[id] ?? id;
}
</script>

<template>
  <div class="panel">
    <div class="toolbar">
      <h2>交班记录</h2>
      <label class="inline-check">
        <input type="checkbox" v-model="onlyShortage" /> 只看现金有差额的记录
      </label>
    </div>

    <div v-if="filteredLogs.length === 0" class="empty">
      暂无交班记录。完成一次换班后，记录会保存在这里（本机浏览器）。
    </div>

    <article v-for="log in filteredLogs" :key="log.id" class="log-card">
      <div class="log-head" @click="toggle(log.id)">
        <div>
          <strong>{{ log.id }}</strong>
          <span class="muted">{{ new Date(log.finishedAt).toLocaleString() }}</span>
        </div>
        <div class="log-tags">
          <span class="chip chip-ok">转出 {{ log.acceptedCount }} 单</span>
          <span v-if="log.retainedCount" class="chip chip-retain">留单 {{ log.retainedCount }}</span>
          <span :class="['chip', log.cash.diffCents === 0 ? 'chip-normal' : 'chip-warn']">
            {{ log.cash.diffCents === 0 ? "现金核平" : `差额 ${formatYuan(Math.abs(log.cash.diffCents))}` }}
          </span>
          <span class="toggle-mark">{{ expanded.has(log.id) ? "收起 ▲" : "明细 ▼" }}</span>
        </div>
      </div>

      <div v-if="expanded.has(log.id)" class="log-body">
        <p>
          原骑手：{{ nameOf(log, log.fromRiderId) }}　·
          应收 {{ formatYuan(log.cash.expectedCents) }}，实交 {{ formatYuan(log.cash.submittedCents) }}，
          差额 {{ formatYuan(log.cash.diffCents) }}
        </p>
        <div v-if="log.review" class="review-record">
          班长 {{ log.review.name }} 于 {{ new Date(log.review.reviewedAt).toLocaleString() }} 复核放行：
          {{ log.review.opinion }}
        </div>
        <div class="table-wrap">
          <table>
            <thead>
              <tr><th>站序</th><th>单号</th><th>冷链</th><th>去向</th><th>说明</th></tr>
            </thead>
            <tbody>
              <tr v-for="r in log.results" :key="r.orderId" :class="r.accepted ? '' : 'row-retain'">
                <td>{{ r.stopIndex }}</td>
                <td>{{ r.code }}</td>
                <td>{{ r.cold ? "冷链" : "常温" }}</td>
                <td>{{ nameOf(log, r.riderId) }}</td>
                <td>
                  <span v-if="r.accepted" class="chip chip-ok">承接</span>
                  <template v-else>
                    <span class="chip chip-retain">留在原骑手</span>
                    <span class="reason">{{ r.reason }}</span>
                  </template>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </article>
  </div>
</template>
