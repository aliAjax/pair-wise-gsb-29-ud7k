<script setup lang="ts">
import { reactive, ref, watch } from "vue";
import { ElMessage } from "element-plus";
import type { CashCheck } from "../types";
import { RIDERS } from "../data/riders";
import { formatFen } from "../lib/money";

const props = defineProps<{
  visible: boolean;
  cashCheck: CashCheck;
}>();

const emit = defineEmits<{
  "update:visible": [value: boolean];
  release: [payload: { leaderId: string; leaderName: string; comment: string }];
}>();

const leaders = RIDERS.filter((r) => r.isLeader);

const leaderId = ref(leaders[0]?.id ?? "");
const comment = reactive({ value: "" });

watch(
  () => props.visible,
  (visible) => {
    if (visible) {
      leaderId.value = leaders[0]?.id ?? "";
      comment.value = "";
    }
  }
);

function close() {
  emit("update:visible", false);
}

function confirm() {
  const leader = leaders.find((r) => r.id === leaderId.value);
  if (!leader) {
    ElMessage.warning("请选择复核班长");
    return;
  }
  if (!comment.value.trim()) {
    ElMessage.warning("请填写班长复核意见，说明差额去向");
    return;
  }
  emit("release", { leaderId: leader.id, leaderName: leader.name, comment: comment.value.trim() });
  close();
}
</script>

<template>
  <el-dialog
    :model-value="visible"
    title="班长复核放行"
    width="480px"
    @update:model-value="emit('update:visible', $event)"
  >
    <el-alert
      type="warning"
      :closable="false"
      show-icon
      title="现金未核平，换班暂停"
      :description="`应收 ${formatFen(cashCheck.expectedFen)}，实交 ${formatFen(
        cashCheck.submittedFen
      )}，差额 ${formatFen(cashCheck.diffFen, true)}。须由班长确认差额原因并放行后，才能继续路线确认。`"
      class="review-alert"
    />
    <el-form label-width="86px" class="review-form" @submit.prevent>
      <el-form-item label="复核班长" required>
        <el-select v-model="leaderId" placeholder="请选择班长" style="width: 100%">
          <el-option v-for="r in leaders" :key="r.id" :label="r.name" :value="r.id" />
        </el-select>
      </el-form-item>
      <el-form-item label="复核意见" required>
        <el-input
          v-model="comment.value"
          type="textarea"
          :rows="3"
          placeholder="如：骑手垫付款 ¥12.50，已核票据，同意放行"
        />
      </el-form-item>
    </el-form>
    <template #footer>
      <el-button @click="close">取消</el-button>
      <el-button type="warning" @click="confirm">班长放行</el-button>
    </template>
  </el-dialog>
</template>

<style scoped>
.review-alert {
  margin-bottom: 16px;
}
.review-form {
  margin-top: 4px;
}
</style>
