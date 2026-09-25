<script setup lang="ts">
import { reactive, watch } from "vue";
import { ElMessage } from "element-plus";
import type { PendingOrder } from "../types";
import { fenToYuan, yuanToFen } from "../lib/money";

const props = defineProps<{
  visible: boolean;
  /** 传入则为编辑，否则为新增 */
  order?: PendingOrder | null;
}>();

const emit = defineEmits<{
  "update:visible": [value: boolean];
  create: [payload: Omit<PendingOrder, "id">];
  update: [id: string, payload: Partial<PendingOrder>];
}>();

const form = reactive({
  label: "",
  stopIndex: 1,
  cold: true,
  freezerSlots: 1,
  cashYuan: 0
});

watch(
  () => props.visible,
  (visible) => {
    if (!visible) return;
    if (props.order) {
      form.label = props.order.label;
      form.stopIndex = props.order.stopIndex;
      form.cold = props.order.cold;
      form.freezerSlots = props.order.freezerSlots;
      form.cashYuan = fenToYuan(props.order.cashCollectedFen);
    } else {
      form.label = "";
      form.stopIndex = 1;
      form.cold = true;
      form.freezerSlots = 1;
      form.cashYuan = 0;
    }
  }
);

function close() {
  emit("update:visible", false);
}

function onColdChange(value: string | number | boolean) {
  const cold = Boolean(value);
  if (!cold) form.freezerSlots = 0;
  else if (form.freezerSlots === 0) form.freezerSlots = 1;
}

function confirm() {
  if (!form.label.trim()) {
    ElMessage.warning("请填写订单摘要（客户/地址）");
    return;
  }
  if (form.stopIndex < 1) {
    ElMessage.warning("站点序号需 ≥ 1");
    return;
  }
  const payload: Omit<PendingOrder, "id"> = {
    label: form.label.trim(),
    stopIndex: form.stopIndex,
    cold: form.cold,
    freezerSlots: form.cold ? Math.max(1, Math.round(form.freezerSlots)) : 0,
    cashCollectedFen: Math.max(0, yuanToFen(form.cashYuan))
  };
  if (props.order) emit("update", props.order.id, payload);
  else emit("create", payload);
  close();
}
</script>

<template>
  <el-dialog
    :model-value="visible"
    :title="order ? '编辑未送订单' : '新增未送订单'"
    width="460px"
    @update:model-value="emit('update:visible', $event)"
  >
    <el-form label-width="110px" @submit.prevent>
      <el-form-item label="订单摘要" required>
        <el-input
          v-model="form.label"
          placeholder="如：阳光花园 3-201 张女士"
          maxlength="40"
        />
      </el-form-item>
      <el-form-item label="路线站点序" required>
        <el-input-number v-model="form.stopIndex" :min="1" :max="99" controls-position="right" />
        <span class="hint">按剩余路线先后排序，从 1 开始</span>
      </el-form-item>
      <el-form-item label="是否冷链">
        <el-switch v-model="form.cold" @change="onColdChange" />
      </el-form-item>
      <el-form-item v-if="form.cold" label="占冷冻格数" required>
        <el-input-number v-model="form.freezerSlots" :min="1" :max="20" controls-position="right" />
      </el-form-item>
      <el-form-item label="已收现金">
        <el-input-number
          v-model="form.cashYuan"
          :min="0"
          :precision="2"
          :step="10"
          controls-position="right"
        />
        <span class="hint">元，客户已付的现金</span>
      </el-form-item>
    </el-form>
    <template #footer>
      <el-button @click="close">取消</el-button>
      <el-button type="primary" @click="confirm">保存</el-button>
    </template>
  </el-dialog>
</template>

<style scoped>
.hint {
  margin-left: 10px;
  color: #909db0;
  font-size: 12px;
}
</style>
