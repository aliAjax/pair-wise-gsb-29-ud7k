<script setup lang="ts">
import { computed, ref } from "vue";
import { storeToRefs } from "pinia";
import { ElMessage, ElMessageBox } from "element-plus";
import { useHandoverStore } from "../stores/handover";
import { formatFen } from "../lib/money";
import type { HandoverRecord } from "../types";

const store = useHandoverStore();
const { records } = storeToRefs(store);

const keyword = ref("");
const detail = ref<HandoverRecord | null>(null);

const filtered = computed(() => {
  const kw = keyword.value.trim();
  if (!kw) return records.value;
  return records.value.filter(
    (r) =>
      r.seq.includes(kw) ||
      r.outgoingRiderName.includes(kw) ||
      r.incomingRiderName.includes(kw)
  );
});

function fmtTime(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(
    2,
    "0"
  )}`;
}

async function removeRecord(record: HandoverRecord) {
  await ElMessageBox.confirm(`确定删除交接单 ${record.seq} 吗？此操作不可恢复。`, "删除交接单", {
    type: "warning",
    confirmButtonText: "删除",
    cancelButtonText: "取消"
  });
  store.records = store.records.filter((r) => r.id !== record.id);
  store.persistRecords();
  if (detail.value?.id === record.id) detail.value = null;
  ElMessage.success("已删除");
}
</script>

<template>
  <div class="page">
    <el-card shadow="never" class="list-card">
      <template #header>
        <div class="card-head">
          <span class="card-title">交班记录（已封存）</span>
          <el-input
            v-model="keyword"
            placeholder="按单号 / 骑手姓名筛选"
            clearable
            style="width: 260px"
          />
        </div>
      </template>

      <el-table :data="filtered" border>
        <el-table-column label="交接单号" prop="seq" width="160" />
        <el-table-column label="交接时间" width="150">
          <template #default="{ row }">{{ fmtTime(row.createdAt) }}</template>
        </el-table-column>
        <el-table-column label="交班 → 接班" min-width="230">
          <template #default="{ row }">
            {{ row.outgoingRiderName }} → {{ row.incomingRiderName }}
          </template>
        </el-table-column>
        <el-table-column label="现金" min-width="250">
          <template #default="{ row }">
            <el-tag v-if="row.cashCheck.balanced" type="success" size="small">已核平</el-tag>
            <el-tag v-else type="warning" effect="dark" size="small">
              差额放行 {{ formatFen(row.cashCheck.diffFen, true) }}
            </el-tag>
            <span class="cash-fig">{{ formatFen(row.cashCheck.submittedFen) }}</span>
          </template>
        </el-table-column>
        <el-table-column label="承接/留下" width="130" align="center">
          <template #default="{ row }">
            <el-tag type="success" size="small">{{ row.acceptedCount }}</el-tag>
            <span class="slash">/</span>
            <el-tag :type="row.retainedCount ? 'danger' : 'info'" size="small">
              {{ row.retainedCount }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="冷冻格" width="110" align="center">
          <template #default="{ row }">{{ row.usedSlots }}/{{ row.freezerCapacity }}</template>
        </el-table-column>
        <el-table-column label="操作" width="140" align="center">
          <template #default="{ row }">
            <el-button link type="primary" size="small" @click="detail = row">查看明细</el-button>
            <el-button link type="danger" size="small" @click="removeRecord(row)">删除</el-button>
          </template>
        </el-table-column>
        <template #empty>
          <el-empty description="暂无交班记录，去「交班核对台」完成一次换班" />
        </template>
      </el-table>
    </el-card>

    <el-drawer
      :model-value="detail !== null"
      title="交班明细"
      size="560px"
      :with-header="true"
      @update:model-value="(v) => { if (!v) detail = null }"
    >
      <template v-if="detail">
        <el-descriptions :column="1" border size="small" class="detail-desc">
          <el-descriptions-item label="交接单号">{{ detail.seq }}</el-descriptions-item>
          <el-descriptions-item label="交接时间">{{ fmtTime(detail.createdAt) }}</el-descriptions-item>
          <el-descriptions-item label="交班骑手">{{ detail.outgoingRiderName }}</el-descriptions-item>
          <el-descriptions-item label="接班骑手">{{ detail.incomingRiderName }}</el-descriptions-item>
          <el-descriptions-item label="应上交现金">{{ formatFen(detail.cashCheck.expectedFen) }}</el-descriptions-item>
          <el-descriptions-item label="实际上交现金">{{ formatFen(detail.cashCheck.submittedFen) }}</el-descriptions-item>
          <el-descriptions-item label="现金差额">
            <span :class="detail.cashCheck.balanced ? 'ok' : 'bad'">
              {{ formatFen(detail.cashCheck.diffFen, true) }}
              （{{ detail.cashCheck.balanced ? "已核平" : "班长复核放行" }}）
            </span>
          </el-descriptions-item>
          <el-descriptions-item v-if="detail.review" label="班长复核">
            {{ detail.review.leaderName }} · {{ detail.review.comment }}
            <div class="review-time">复核时间：{{ fmtTime(detail.review.reviewAt) }}</div>
          </el-descriptions-item>
          <el-descriptions-item label="冷冻格占用">
            {{ detail.usedSlots }} / {{ detail.freezerCapacity }} 格
          </el-descriptions-item>
        </el-descriptions>

        <h4 class="orders-title">订单明细（按路线顺序）</h4>
        <el-table :data="[...detail.orders].sort((a, b) => a.stopIndex - b.stopIndex)" border size="small">
          <el-table-column label="站序" prop="stopIndex" width="52" align="center" />
          <el-table-column label="订单" prop="label" min-width="170" />
          <el-table-column label="冷链" width="58" align="center">
            <template #default="{ row }">{{ row.cold ? "冷" : "常" }}</template>
          </el-table-column>
          <el-table-column label="格" prop="freezerSlots" width="44" align="center" />
          <el-table-column label="现金" width="86" align="right">
            <template #default="{ row }">{{ formatFen(row.cashCollectedFen) }}</template>
          </el-table-column>
          <el-table-column label="归属/原因" min-width="150">
            <template #default="{ row }">
              <el-tag v-if="row.accepted" type="success" size="small">接班</el-tag>
              <el-tag v-else type="danger" size="small">原骑手</el-tag>
              <div v-if="row.reason" class="retain-reason">{{ row.reason }}</div>
            </template>
          </el-table-column>
        </el-table>
      </template>
    </el-drawer>
  </div>
</template>

<style scoped>
.card-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}
.card-title {
  font-weight: 700;
  font-size: 16px;
}
.cash-fig {
  margin-left: 8px;
  color: #445069;
}
.slash {
  margin: 0 4px;
  color: #a8b3c4;
}
.detail-desc {
  margin-bottom: 18px;
}
.ok {
  color: #14724f;
  font-weight: 600;
}
.bad {
  color: #c8841b;
  font-weight: 600;
}
.review-time {
  color: #909db0;
  font-size: 12px;
  margin-top: 2px;
}
.orders-title {
  margin: 0 0 10px;
}
.retain-reason {
  color: #c84b31;
  font-size: 12px;
  margin-top: 4px;
  line-height: 1.5;
}
</style>
