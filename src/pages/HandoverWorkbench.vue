<script setup lang="ts">
import { computed, ref } from "vue";
import { storeToRefs } from "pinia";
import { ElMessage, ElMessageBox } from "element-plus";
import { useHandoverStore } from "../stores/handover";
import { RIDERS, riderById } from "../data/riders";
import { fenToYuan, formatFen, yuanToFen } from "../lib/money";
import OrderEditDialog from "../components/OrderEditDialog.vue";
import LeaderReviewDialog from "../components/LeaderReviewDialog.vue";
import type { PendingOrder } from "../types";

const store = useHandoverStore();
const { draft, cashCheck, cashCleared, routePlan } = storeToRefs(store);

const normalRiders = RIDERS.filter((r) => !r.isLeader);

const submittedYuan = computed({
  get: () => fenToYuan(draft.value.submittedFen),
  set: (v: number) => store.setSubmittedFen(yuanToFen(v))
});

const capacity = computed({
  get: () => draft.value.freezerCapacity,
  set: (v: number) => store.setFreezerCapacity(Math.max(0, Math.round(v || 0)))
});

/* ---------- 订单弹窗 ---------- */
const orderDialogVisible = ref(false);
const editingOrder = ref<PendingOrder | null>(null);

function openCreate() {
  editingOrder.value = null;
  orderDialogVisible.value = true;
}
function openEdit(order: PendingOrder) {
  editingOrder.value = order;
  orderDialogVisible.value = true;
}
async function removeOrder(order: PendingOrder) {
  await ElMessageBox.confirm(`确定移除「${order.label}」吗？`, "移除订单", {
    type: "warning",
    confirmButtonText: "移除",
    cancelButtonText: "取消"
  });
  store.removeOrder(order.id);
  ElMessage.success("已移除");
}

/* ---------- 现金阶段 → 路线阶段 ---------- */
const reviewVisible = ref(false);

function tryGoRoute() {
  if (draft.value.orders.length === 0) {
    ElMessage.warning("请先登记至少一单未送订单");
    return;
  }
  if (draft.value.outgoingRiderId === draft.value.incomingRiderId) {
    ElMessage.warning("接班骑手不能与交班骑手相同");
    return;
  }
  if (cashCheck.value.balanced) {
    store.goToRoute();
  } else {
    // 现金有差额：停在班长复核
    reviewVisible.value = true;
  }
}

function onLeaderRelease(payload: { leaderId: string; leaderName: string; comment: string }) {
  store.leaderRelease(payload);
  ElMessage.success("班长已复核放行");
  store.goToRoute();
}

/* ---------- 完成换班 ---------- */
async function complete() {
  const plan = routePlan.value;
  const tip = plan.allFit
    ? "全部订单均可承接，确认完成换班？"
    : `有 ${plan.retained.length} 单装不下、留在原骑手。确认完成换班并封存记录？`;
  await ElMessageBox.confirm(tip, "完成换班", {
    type: plan.allFit ? "info" : "warning",
    confirmButtonText: "完成换班",
    cancelButtonText: "再看看"
  });
  const record = store.completeHandover();
  if (record) {
    ElMessage.success(`换班完成，交接单号 ${record.seq} 已封存`);
  }
}

const coldCount = computed(() => draft.value.orders.filter((o) => o.cold).length);
const needSlots = computed(() =>
  draft.value.orders.filter((o) => o.cold).reduce((s, o) => s + o.freezerSlots, 0)
);
const sortedOrders = computed(() =>
  [...draft.value.orders].sort((a, b) => a.stopIndex - b.stopIndex)
);
const outgoingName = computed(
  () => riderById(draft.value.outgoingRiderId)?.name ?? "交班骑手"
);
</script>

<template>
  <div class="page">
    <el-steps :active="draft.stage === 'cash' ? 0 : 1" align-center finish-status="success" class="steps">
      <el-step title="① 现金核平" description="先把已收现金核平，差额走班长复核" />
      <el-step title="② 路线与冷冻格确认" description="按剩余路线顺序逐单确认承接" />
      <el-step title="③ 完成换班" description="封存交班记录" />
    </el-steps>

    <!-- ============ 阶段一：现金核平 ============ -->
    <el-card v-if="draft.stage === 'cash'" shadow="never" class="stage-card">
      <template #header>
        <div class="card-head">
          <span class="card-title">交接人与未送订单</span>
          <el-button type="primary" plain size="small" @click="openCreate">+ 登记未送订单</el-button>
        </div>
      </template>

      <div class="rider-row">
        <div class="rider-field">
          <label>交班骑手</label>
          <el-select
            :model-value="draft.outgoingRiderId"
            placeholder="交班骑手"
            style="width: 100%"
            @update:model-value="store.setRiders($event, draft.incomingRiderId)"
          >
            <el-option v-for="r in normalRiders" :key="r.id" :label="r.name" :value="r.id" />
          </el-select>
        </div>
        <div class="arrow">→</div>
        <div class="rider-field">
          <label>接班骑手</label>
          <el-select
            :model-value="draft.incomingRiderId"
            placeholder="接班骑手"
            style="width: 100%"
            @update:model-value="store.setRiders(draft.outgoingRiderId, $event)"
          >
            <el-option v-for="r in normalRiders" :key="r.id" :label="r.name" :value="r.id" />
          </el-select>
        </div>
        <div class="rider-field">
          <label>接班车冷冻格容量（格）</label>
          <el-input-number v-model="capacity" :min="0" :max="50" controls-position="right" />
        </div>
      </div>

      <el-table :data="sortedOrders" border size="default" class="order-table">
        <el-table-column label="站点序" prop="stopIndex" width="76" align="center" />
        <el-table-column label="订单摘要" prop="label" min-width="220" />
        <el-table-column label="冷链" width="80" align="center">
          <template #default="{ row }">
            <el-tag v-if="row.cold" type="primary" effect="dark" size="small">冷链</el-tag>
            <el-tag v-else type="info" size="small">常温</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="冷冻格" width="80" align="center">
          <template #default="{ row }">{{ row.cold ? row.freezerSlots : "—" }}</template>
        </el-table-column>
        <el-table-column label="已收现金" width="120" align="right">
          <template #default="{ row }">{{ formatFen(row.cashCollectedFen) }}</template>
        </el-table-column>
        <el-table-column label="操作" width="130" align="center">
          <template #default="{ row }">
            <el-button link type="primary" size="small" @click="openEdit(row)">编辑</el-button>
            <el-button link type="danger" size="small" @click="removeOrder(row)">移除</el-button>
          </template>
        </el-table-column>
      </el-table>

      <div class="cash-block">
        <div class="cash-row">
          <span class="cash-label">未送订单合计</span>
          <span class="cash-sub">{{ sortedOrders.length }} 单（冷链 {{ coldCount }} 单，共需 {{ needSlots }} 冷冻格）</span>
        </div>
        <div class="cash-row">
          <span class="cash-label">应上交现金（各单已收合计）</span>
          <strong class="cash-strong">{{ formatFen(cashCheck.expectedFen) }}</strong>
        </div>
        <div class="cash-row">
          <span class="cash-label">交班骑手实际清点上交现金</span>
          <div class="cash-input">
            <el-input-number
              v-model="submittedYuan"
              :min="0"
              :precision="2"
              :step="50"
              controls-position="right"
            />
            <span class="unit">元</span>
          </div>
        </div>

        <el-alert
          v-if="cashCheck.balanced"
          type="success"
          :closable="false"
          show-icon
          title="现金已核平，账实相符，可以进入路线确认。"
        />
        <template v-else>
          <el-alert
            type="error"
            :closable="false"
            show-icon
            :title="`现金不平：差额 ${formatFen(cashCheck.diffFen, true)}，换班暂停，须班长复核放行。`"
            :description="cashCheck.diffFen < 0 ? '实交少于应收，可能有现金遗漏或垫付未登记。' : '实交多于应收，可能有预收或找零混入个人账。'"
          />
          <el-alert
            v-if="draft.released && draft.review"
            class="release-tip"
            type="warning"
            :closable="false"
            show-icon
            :title="`已由 ${draft.review.leaderName} 复核放行：${draft.review.comment}`"
          />
        </template>

        <div class="stage-actions">
          <el-button @click="store.resetDraft">重置草稿</el-button>
          <el-button v-if="!cashCleared" type="warning" @click="reviewVisible = true">
            请班长复核
          </el-button>
          <el-button type="primary" @click="tryGoRoute">
            {{ cashCleared ? "现金已平/已放行，下一步：路线确认" : "核平后进入路线确认" }}
          </el-button>
        </div>
      </div>
    </el-card>

    <!-- ============ 阶段二：路线与冷冻格确认 ============ -->
    <el-card v-else shadow="never" class="stage-card">
      <template #header>
        <div class="card-head">
          <span class="card-title">
            剩余路线承接确认 · {{ outgoingName }} →
            {{ riderById(draft.incomingRiderId)?.name }}
          </span>
          <el-button size="small" @click="store.backToCash">返回核现金</el-button>
        </div>
      </template>

      <el-alert
        v-if="!cashCheck.balanced && draft.review"
        type="warning"
        :closable="false"
        show-icon
        class="release-tip"
        :title="`现金差额 ${formatFen(cashCheck.diffFen, true)} 已经班长 ${draft.review.leaderName} 复核放行（${draft.review.comment}）`"
      />

      <div class="capacity-strip">
        <span>冷冻格容量 <b>{{ routePlan.freezerCapacity }}</b> 格</span>
        <span>承接占用 <b>{{ routePlan.usedSlots }}</b> 格</span>
        <span>
          剩余
          <b :class="{ over: routePlan.usedSlots > routePlan.freezerCapacity }">
            {{ routePlan.freezerCapacity - routePlan.usedSlots }}
          </b>
          格
        </span>
        <el-progress
          :percentage="routePlan.freezerCapacity === 0 ? 0 : Math.min(100, Math.round((routePlan.usedSlots / routePlan.freezerCapacity) * 100))"
          :stroke-width="14"
          style="flex: 1; min-width: 160px"
        />
      </div>

      <h3 class="block-title">按剩余路线顺序逐单确认</h3>
      <el-table :data="[...routePlan.accepted, ...routePlan.retained].sort((a, b) => a.stopIndex - b.stopIndex)" border>
        <el-table-column label="站序" prop="stopIndex" width="64" align="center" />
        <el-table-column label="订单" prop="label" min-width="210" />
        <el-table-column label="类型" width="80" align="center">
          <template #default="{ row }">
            <el-tag v-if="row.cold" type="primary" effect="dark" size="small">冷链</el-tag>
            <el-tag v-else type="info" size="small">常温</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="占格" width="64" align="center">
          <template #default="{ row }">{{ row.cold ? row.freezerSlots : "—" }}</template>
        </el-table-column>
        <el-table-column label="累计占用" width="90" align="center">
          <template #default="{ row }">
            <span v-if="row.accepted && row.cold">{{ row.usedSlotsAfter }} 格</span>
            <span v-else-if="row.accepted">不占格</span>
            <span v-else>—</span>
          </template>
        </el-table-column>
        <el-table-column label="现金" width="110" align="right">
          <template #default="{ row }">{{ formatFen(row.cashCollectedFen) }}</template>
        </el-table-column>
        <el-table-column label="归属" min-width="260">
          <template #default="{ row }">
            <el-tag v-if="row.accepted" type="success" size="small">接班承接</el-tag>
            <el-tag v-else type="danger" effect="dark" size="small">留在原骑手</el-tag>
            <div v-if="!row.accepted" class="retain-reason">原因：{{ row.reason }}</div>
          </template>
        </el-table-column>
      </el-table>

      <el-alert
        class="release-tip"
        :type="routePlan.allFit ? 'success' : 'warning'"
        :closable="false"
        show-icon
        :title="
          routePlan.allFit
            ? `全部 ${routePlan.accepted.length} 单均可承接，冷冻格未超容。`
            : `${routePlan.accepted.length} 单由接班骑手承接，${routePlan.retained.length} 单装不下、留在 ${outgoingName} 继续配送（原因见上表）。`
        "
      />

      <div class="stage-actions">
        <el-button @click="store.backToCash">上一步</el-button>
        <el-button type="primary" size="large" @click="complete">
          确认完成换班并封存记录
        </el-button>
      </div>
    </el-card>

    <OrderEditDialog
      v-model:visible="orderDialogVisible"
      :order="editingOrder"
      @create="store.addOrder"
      @update="store.updateOrder"
    />
    <LeaderReviewDialog
      v-model:visible="reviewVisible"
      :cash-check="cashCheck"
      @release="onLeaderRelease"
    />
  </div>
</template>

<style scoped>
.page {
  display: grid;
  gap: 16px;
}
.steps {
  background: #fff;
  border-radius: 10px;
  padding: 22px 28px 8px;
  border: 1px solid #e6ebf3;
}
.stage-card {
  border-radius: 10px;
}
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
.rider-row {
  display: flex;
  align-items: flex-end;
  gap: 14px;
  margin-bottom: 16px;
  flex-wrap: wrap;
}
.rider-field {
  display: grid;
  gap: 6px;
  flex: 1;
  min-width: 180px;
}
.rider-field label {
  font-size: 13px;
  color: #5b667a;
}
.arrow {
  font-size: 22px;
  color: #176b87;
  padding-bottom: 8px;
  font-weight: 700;
}
.order-table {
  margin-bottom: 18px;
}
.cash-block {
  display: grid;
  gap: 12px;
  background: #f7f9fc;
  border: 1px dashed #d2dcea;
  border-radius: 10px;
  padding: 16px 18px;
}
.cash-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}
.cash-label {
  color: #445069;
  font-size: 14px;
}
.cash-sub {
  color: #8a96ab;
  font-size: 13px;
}
.cash-strong {
  font-size: 22px;
  color: #176b87;
}
.cash-input {
  display: flex;
  align-items: center;
  gap: 8px;
}
.unit {
  color: #5b667a;
}
.release-tip {
  margin-top: 2px;
}
.stage-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 6px;
  flex-wrap: wrap;
}
.capacity-strip {
  display: flex;
  align-items: center;
  gap: 18px;
  background: #f0f6fb;
  border-radius: 10px;
  padding: 12px 16px;
  margin-bottom: 16px;
  flex-wrap: wrap;
  color: #445069;
  font-size: 14px;
}
.capacity-strip b {
  font-size: 18px;
  color: #176b87;
}
.capacity-strip b.over {
  color: #c84b31;
}
.block-title {
  margin: 4px 0 10px;
  font-size: 15px;
}
.retain-reason {
  margin-top: 4px;
  color: #c84b31;
  font-size: 12.5px;
  line-height: 1.5;
}
</style>
