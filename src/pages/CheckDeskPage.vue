<script setup lang="ts">
// 交班核对台（页面层）
// 只做交互与展示；现金规则、路线/冷冻格判断、状态流转都在 src/domain。
import { computed, reactive, ref } from "vue";
import { centsToYuan, formatYuan, yuanToCents } from "../domain/cash";
import {
  approveReview,
  completeHandoff,
  confirmCapacity,
  createHandoff,
  reopenCash,
  setAssignee,
  submitCash,
  type CompletedHandoff,
  type HandoffState,
} from "../domain/handoff";
import { useHandoverStore } from "../store/handoverStore";

const store = useHandoverStore();

/* ---------- 交接前：选择原骑手、补录订单 ---------- */
const fromRiderId = ref(store.riders[0]?.id ?? "");
const newAddr = ref("");
const newCold = ref(false);
const newCashYuan = ref<number>(0);
const newStop = ref<number>(1);

const pendingOrders = computed(() =>
  fromRiderId.value ? store.pendingOrdersOf(fromRiderId.value) : [],
);

function addPending() {
  if (!fromRiderId.value || !newAddr.value.trim()) return;
  const stop = newStop.value || pendingOrders.value.length + 1;
  store.addOrder({
    code: `DD-NEW-${String(Date.now()).slice(-4)}`,
    address: newAddr.value.trim(),
    riderId: fromRiderId.value,
    cold: newCold.value,
    cashCents: yuanToCents(Number(newCashYuan.value) || 0),
    stopIndex: stop,
  });
  newAddr.value = "";
  newCold.value = false;
  newCashYuan.value = 0;
  newStop.value = pendingOrders.value.length + 2;
}

/* ---------- 交接流程状态 ---------- */
const handoff = ref<HandoffState | null>(null);
const finished = ref<CompletedHandoff | null>(null);
const errorMsg = ref("");

const supervisor = reactive({ name: "", opinion: "" });

function fail(err: unknown) {
  errorMsg.value = err instanceof Error ? err.message : String(err);
}
function clearError() {
  errorMsg.value = "";
}

function startHandoff() {
  clearError();
  try {
    handoff.value = createHandoff(fromRiderId.value, [...pendingOrders.value]);
    finished.value = null;
    submittedYuan.value = centsToYuan(handoff.value.submittedCents);
  } catch (err) {
    fail(err);
  }
}

function cancelHandoff() {
  handoff.value = null;
  finished.value = null;
  errorMsg.value = "";
  supervisor.name = "";
  supervisor.opinion = "";
}

/* ---------- 现金核对 ---------- */
const submittedYuan = ref(0);

const expectedCents = computed(() =>
  handoff.value
    ? handoff.value.rows.reduce((s, r) => s + r.cashCents, 0)
    : 0,
);

function onSubmitCash() {
  if (!handoff.value) return;
  clearError();
  try {
    handoff.value.submittedCents = yuanToCents(Number(submittedYuan.value) || 0);
    submitCash(handoff.value);
    if (handoff.value.stage === "review") {
      errorMsg.value = ""; // 差额是正常闸门，用专门的复核卡片提示
    }
  } catch (err) {
    fail(err);
  }
}

function onApprove() {
  if (!handoff.value) return;
  clearError();
  try {
    approveReview(handoff.value, { name: supervisor.name, opinion: supervisor.opinion });
  } catch (err) {
    fail(err);
  }
}

function onReopenCash() {
  if (!handoff.value) return;
  clearError();
  try {
    reopenCash(handoff.value);
  } catch (err) {
    fail(err);
  }
}

const successorRiders = computed(() =>
  handoff.value ? store.successorCandidates(handoff.value.fromRiderId) : [],
);

function onConfirmCapacity() {
  if (!handoff.value) return;
  clearError();
  try {
    confirmCapacity(handoff.value, store.riders);
  } catch (err) {
    fail(err);
  }
}

/* ---------- 完成换班 ---------- */
function onComplete() {
  if (!handoff.value) return;
  clearError();
  try {
    const record = completeHandoff(handoff.value);
    finished.value = store.completeAndLog(record);
    handoff.value = null;
  } catch (err) {
    fail(err);
  }
}

const stageIndex = computed(() => {
  if (!handoff.value) return -1;
  return { cash: 0, review: 1, capacity: 2, done: 3 }[handoff.value.stage];
});
</script>

<template>
  <div class="desk">
    <!-- 交接前准备 -->
    <section v-if="!handoff && !finished" class="panel">
      <h2>选择交班骑手</h2>
      <p class="hint">晚班骑手手里未送完的订单在此核对面交接，先核现金、再评路线与冷冻格。</p>
      <div class="inline-form">
        <label>
          原骑手
          <select v-model="fromRiderId">
            <option v-for="r in store.riders" :key="r.id" :value="r.id">{{ r.name }}</option>
          </select>
        </label>
        <button type="button" :disabled="pendingOrders.length === 0" @click="startHandoff">
          开始交班核对（{{ pendingOrders.length }} 单）
        </button>
      </div>
      <p v-if="pendingOrders.length === 0" class="warn">该骑手没有待交接（未送达）订单。</p>

      <h3 class="sub">在手订单（按剩余路线顺序）</h3>
      <div v-if="pendingOrders.length" class="table-wrap">
        <table>
          <thead>
            <tr><th>站序</th><th>单号</th><th>地址</th><th>冷链</th><th>已收现金</th></tr>
          </thead>
          <tbody>
            <tr v-for="o in pendingOrders" :key="o.id">
              <td>{{ o.stopIndex }}</td>
              <td>{{ o.code }}</td>
              <td>{{ o.address }}</td>
              <td><span :class="['chip', o.cold ? 'chip-cold' : 'chip-normal']">{{ o.cold ? "冷链" : "常温" }}</span></td>
              <td>{{ formatYuan(o.cashCents) }}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <h3 class="sub">补录未送订单</h3>
      <div class="inline-form wrap">
        <label>地址<input v-model="newAddr" placeholder="如：朝阳路 19 号" /></label>
        <label class="checkbox-label">
          <input type="checkbox" v-model="newCold" /> 冷链单（占冷冻格）
        </label>
        <label>已收现金(元)<input v-model.number="newCashYuan" type="number" min="0" step="0.01" /></label>
        <label>站序<input v-model.number="newStop" type="number" min="1" /></label>
        <button type="button" class="secondary" :disabled="!newAddr.trim()" @click="addPending">加入在手订单</button>
      </div>
    </section>

    <!-- 交接流程 -->
    <section v-if="handoff" class="panel">
      <div class="handoff-head">
        <div>
          <h2>交班核对台 · {{ store.riderName(handoff.fromRiderId) }}</h2>
          <p class="hint">交接单号 {{ handoff.id }}</p>
        </div>
        <button type="button" class="secondary" @click="cancelHandoff">取消本次交接</button>
      </div>

      <ol class="stepper">
        <li :class="{ active: stageIndex >= 0, current: handoff.stage === 'cash' }">1 现金核对</li>
        <li :class="{ active: stageIndex >= 1, current: handoff.stage === 'review' }">2 班长复核（有差额时）</li>
        <li :class="{ active: stageIndex >= 2, current: handoff.stage === 'capacity' }">3 路线与冷冻格确认</li>
        <li :class="{ active: stageIndex >= 3 }">4 完成换班</li>
      </ol>

      <!-- 闸门一：现金 -->
      <div class="gate" :class="{ disabled: handoff.stage !== 'cash' }">
        <h3>① 现金核对 —— 逐单登记已收现金</h3>
        <div class="table-wrap">
          <table>
            <thead>
              <tr><th>站序</th><th>单号 / 地址</th><th>冷链</th><th>已收现金(元)</th><th v-if="handoff.stage === 'capacity'">接班骑手</th></tr>
            </thead>
            <tbody>
              <tr v-for="row in handoff.rows" :key="row.order.id">
                <td>{{ row.order.stopIndex }}</td>
                <td>{{ row.order.code }}<br /><span class="muted">{{ row.order.address }}</span></td>
                <td><span :class="['chip', row.order.cold ? 'chip-cold' : 'chip-normal']">{{ row.order.cold ? "冷链" : "常温" }}</span></td>
                <td>
                  <input
                    v-if="handoff.stage === 'cash'"
                    :value="centsToYuan(row.cashCents)"
                    type="number" min="0" step="0.01"
                    @input="row.cashCents = yuanToCents(Number(($event.target as HTMLInputElement).value) || 0)"
                  />
                  <span v-else>{{ formatYuan(row.cashCents) }}</span>
                </td>
                <td v-if="handoff.stage === 'capacity'">
                  <select
                    :value="row.toRiderId"
                    :class="{ missing: !row.toRiderId }"
                    @change="setAssignee(handoff!, row.order.id, ($event.target as HTMLSelectElement).value)"
                  >
                    <option value="" disabled>选择接班骑手</option>
                    <option v-for="r in successorRiders" :key="r.id" :value="r.id">{{ r.name }}</option>
                  </select>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <template v-if="handoff.stage === 'cash'">
          <div class="cash-box">
            <label>
              实交现金(元) —— 从原骑手个人账中点出的代收现金
              <input v-model.number="submittedYuan" type="number" min="0" step="0.01" />
            </label>
            <div class="cash-summary">
              <span>应收合计 <strong>{{ formatYuan(expectedCents) }}</strong></span>
              <span>实交 <strong>{{ formatYuan(yuanToCents(Number(submittedYuan) || 0)) }}</strong></span>
              <button type="button" @click="onSubmitCash">提交现金核对</button>
            </div>
          </div>
        </template>

        <template v-else>
          <div :class="['cash-result', handoff.cash?.balanced ? 'ok' : 'bad']">
            <p v-if="handoff.cash?.balanced">
              现金核平：应收 {{ formatYuan(handoff.cash.expectedCents) }}，实交 {{ formatYuan(handoff.cash.submittedCents) }}，差额 0。
            </p>
            <p v-else-if="handoff.cash">
              现金差额：应收 {{ formatYuan(handoff.cash.expectedCents) }}，实交 {{ formatYuan(handoff.cash.submittedCents) }}，
              差额 <strong>{{ formatYuan(Math.abs(handoff.cash.diffCents)) }}{{ handoff.cash.diffCents > 0 ? "（长款）" : "（短款）" }}</strong>
              —— 已停在班长复核。
            </p>
          </div>
        </template>
      </div>

      <!-- 闸门二：班长复核 -->
      <div v-if="handoff.stage === 'review'" class="gate review-gate">
        <h3>② 班长复核（现金有差额，未放行前不能继续）</h3>
        <div class="inline-form wrap">
          <label>班长姓名<input v-model="supervisor.name" placeholder="当班班长" /></label>
          <label class="grow">复核意见 / 差额处理
            <input v-model="supervisor.opinion" placeholder="如：短款 12.5 元骑手王强当场补平后放行" />
          </label>
        </div>
        <div class="actions">
          <button type="button" @click="onApprove">班长复核放行</button>
          <button type="button" class="secondary" @click="onReopenCash">退回重新点现金</button>
        </div>
      </div>

      <!-- 闸门三：路线与冷冻格 -->
      <div v-if="handoff.stage === 'capacity'" class="gate">
        <h3>③ 按剩余路线顺序确认冷冻格容量</h3>
        <p class="hint">按站序从小到大逐单装格；非冷链单不占格。接班骑手的车辆情况可现场修正：</p>
        <div class="rider-loads">
          <div v-for="r in successorRiders" :key="r.id" class="rider-load">
            <strong>{{ r.name }}</strong>
            <label>冷冻格(格)
              <input type="number" min="0" :value="r.freezerCapacity"
                @input="store.updateRiderLoad(r.id, { freezerCapacity: Number(($event.target as HTMLInputElement).value) || 0 })" />
            </label>
            <label>车上已装冷链(单)
              <input type="number" min="0" :value="r.coldOnBoard"
                @input="store.updateRiderLoad(r.id, { coldOnBoard: Number(($event.target as HTMLInputElement).value) || 0 })" />
            </label>
            <span v-if="handoff.capacity" class="muted">
              评估后占用 {{ handoff.capacity.occupiedByRider[r.id] ?? r.coldOnBoard }} / {{ r.freezerCapacity }}
            </span>
          </div>
        </div>

        <div class="actions">
          <button type="button" @click="onConfirmCapacity">确认能否承接</button>
          <button type="button" class="secondary" @click="onReopenCash">返回现金环节</button>
        </div>

        <div v-if="handoff.capacity" class="table-wrap">
          <table>
            <thead>
              <tr><th>站序</th><th>单号</th><th>冷链</th><th>接班骑手</th><th>结论</th></tr>
            </thead>
            <tbody>
              <tr v-for="d in handoff.capacity.decisions" :key="d.orderId" :class="d.accepted ? '' : 'row-retain'">
                <td>{{ d.stopIndex }}</td>
                <td>{{ handoff.rows.find(r => r.order.id === d.orderId)?.order.code }}</td>
                <td>{{ handoff.rows.find(r => r.order.id === d.orderId)?.order.cold ? "冷链" : "常温" }}</td>
                <td>{{ store.riderName(d.toRiderId) }}</td>
                <td>
                  <span v-if="d.accepted" class="chip chip-ok">可承接</span>
                  <template v-else>
                    <span class="chip chip-retain">留在原骑手</span>
                    <p class="reason">{{ d.reason }}</p>
                  </template>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <div v-if="handoff.capacity" class="actions">
          <button type="button" class="primary-strong" @click="onComplete">
            完成换班（{{ handoff.capacity.decisions.filter(d => d.accepted).length }} 单转出，
            {{ handoff.capacity.decisions.filter(d => !d.accepted).length }} 单留下）
          </button>
        </div>
      </div>

      <p v-if="errorMsg" class="error-banner">{{ errorMsg }}</p>
    </section>

    <!-- 完成回执 -->
    <section v-if="finished" class="panel done-panel">
      <h2>✅ 换班完成 · {{ finished.id }}</h2>
      <p class="hint">{{ new Date(finished.finishedAt).toLocaleString() }}，原骑手 {{ store.riderName(finished.fromRiderId) }}</p>
      <div class="cash-result ok">
        现金：应收 {{ formatYuan(finished.cash.expectedCents) }}，实交 {{ formatYuan(finished.cash.submittedCents) }}，
        差额 {{ formatYuan(Math.abs(finished.cash.diffCents)) }}
        <template v-if="finished.review">（班长 {{ finished.review.name }} 复核放行：{{ finished.review.opinion }}）</template>
      </div>
      <ul class="done-list">
        <li v-for="r in finished.results" :key="r.orderId">
          站序 {{ r.stopIndex }} · {{ r.code }}（{{ r.cold ? "冷链" : "常温" }}）：
          <span v-if="r.accepted" class="chip chip-ok">已转给 {{ store.riderName(r.riderId) }}</span>
          <span v-else class="chip chip-retain">留在 {{ store.riderName(finished.fromRiderId) }} —— {{ r.reason }}</span>
        </li>
      </ul>
      <div class="actions">
        <a class="btn-link" href="#/logs">查看交班记录</a>
        <button type="button" class="secondary" @click="cancelHandoff">再交一次</button>
      </div>
    </section>
  </div>
</template>
