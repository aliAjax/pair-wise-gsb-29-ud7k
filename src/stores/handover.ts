import { defineStore } from "pinia";
import type {
  Draft,
  HandoverRecord,
  LeaderReview,
  OrderSnapshot,
  PendingOrder
} from "../types";
import { riderById } from "../data/riders";
import { checkCash, planRoute } from "../lib/route";

const RECORDS_KEY = "shift-handover-records";
const DRAFT_KEY = "shift-handover-draft";

const seedOrders = (): PendingOrder[] => [
  {
    id: crypto.randomUUID(),
    label: "阳光花园 3-201 张女士（生鲜）",
    stopIndex: 1,
    cold: true,
    freezerSlots: 1,
    cashCollectedFen: 8650
  },
  {
    id: crypto.randomUUID(),
    label: "科技路 88 号便利店（冰淇淋箱）",
    stopIndex: 2,
    cold: true,
    freezerSlots: 2,
    cashCollectedFen: 12000
  },
  {
    id: crypto.randomUUID(),
    label: "文汇小区 12-606 李先生（常温包裹）",
    stopIndex: 3,
    cold: false,
    freezerSlots: 0,
    cashCollectedFen: 0
  },
  {
    id: crypto.randomUUID(),
    label: "滨河路 17 号药店（冷链药）",
    stopIndex: 4,
    cold: true,
    freezerSlots: 1,
    cashCollectedFen: 4500
  },
  {
    id: crypto.randomUUID(),
    label: "梧桐里 9-102 王女士（冻品）",
    stopIndex: 5,
    cold: true,
    freezerSlots: 1,
    cashCollectedFen: 6320
  },
  {
    id: crypto.randomUUID(),
    label: "城南菜场自提点（常温）",
    stopIndex: 6,
    cold: false,
    freezerSlots: 0,
    cashCollectedFen: 1530
  }
];

function freshDraft(): Draft {
  return {
    outgoingRiderId: "r-a",
    incomingRiderId: "r-b",
    freezerCapacity: 3,
    submittedFen: 33000,
    orders: seedOrders(),
    stage: "cash",
    released: false
  };
}

function loadJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

interface State {
  records: HandoverRecord[];
  draft: Draft;
}

export const useHandoverStore = defineStore("handover", {
  state: (): State => ({
    records: loadJson<HandoverRecord[]>(RECORDS_KEY, []),
    draft: loadJson<Draft | null>(DRAFT_KEY, null) ?? freshDraft()
  }),

  getters: {
    cashCheck(state) {
      return checkCash(state.draft.orders, state.draft.submittedFen);
    },
    /** 现金是否已核平或已经班长放行；未放行差额会阻断进入路线确认 */
    cashCleared(): boolean {
      return this.cashCheck.balanced || this.draft.released;
    },
    routePlan(state) {
      const incoming = riderById(state.draft.incomingRiderId);
      const outgoing = riderById(state.draft.outgoingRiderId);
      return planRoute(
        state.draft.orders,
        incoming?.name ?? "接班骑手",
        outgoing?.name ?? "交班骑手",
        state.draft.freezerCapacity
      );
    }
  },

  actions: {
    persistDraft() {
      localStorage.setItem(DRAFT_KEY, JSON.stringify(this.draft));
    },
    persistRecords() {
      localStorage.setItem(RECORDS_KEY, JSON.stringify(this.records));
    },

    resetDraft() {
      this.draft = freshDraft();
      this.persistDraft();
    },

    setRiders(outgoingId: string, incomingId: string) {
      this.draft.outgoingRiderId = outgoingId;
      this.draft.incomingRiderId = incomingId;
      this.persistDraft();
    },

    setSubmittedFen(fen: number) {
      this.draft.submittedFen = fen;
      // 现金一变，原有的差额放行即失效，需重新复核
      this.draft.released = false;
      this.draft.review = undefined;
      this.persistDraft();
    },

    setFreezerCapacity(capacity: number) {
      this.draft.freezerCapacity = capacity;
      this.persistDraft();
    },

    addOrder(order: Omit<PendingOrder, "id">) {
      this.draft.orders.push({ ...order, id: crypto.randomUUID() });
      this.persistDraft();
    },

    updateOrder(id: string, patch: Partial<PendingOrder>) {
      const target = this.draft.orders.find((o) => o.id === id);
      if (target) Object.assign(target, patch);
      this.persistDraft();
    },

    removeOrder(id: string) {
      this.draft.orders = this.draft.orders.filter((o) => o.id !== id);
      this.persistDraft();
    },

    goToRoute() {
      if (this.cashCleared) this.draft.stage = "route";
      this.persistDraft();
    },

    backToCash() {
      this.draft.stage = "cash";
      this.persistDraft();
    },

    /** 现金有差额：停在班长复核，记录复核人与意见后放行 */
    leaderRelease(review: Omit<LeaderReview, "reviewedAt">) {
      this.draft.review = { ...review, reviewedAt: new Date().toISOString() };
      this.draft.released = true;
      this.persistDraft();
    },

    /** 完成换班：封存快照到交班记录，清空草稿 */
    completeHandover(): HandoverRecord | null {
      if (!this.cashCleared) return null;

      const outgoing = riderById(this.draft.outgoingRiderId);
      const incoming = riderById(this.draft.incomingRiderId);
      if (!outgoing || !incoming) return null;

      const plan = this.routePlan;
      const snap = (o: (typeof plan.accepted)[number]): OrderSnapshot => ({
        orderId: o.id,
        label: o.label,
        stopIndex: o.stopIndex,
        cold: o.cold,
        freezerSlots: o.freezerSlots,
        cashCollectedFen: o.cashCollectedFen,
        carrierName: o.carrierName,
        accepted: o.accepted,
        reason: o.reason
      });

      const record: HandoverRecord = {
        id: crypto.randomUUID(),
        seq: this.nextSeq(),
        createdAt: new Date().toISOString(),
        outgoingRiderId: outgoing.id,
        outgoingRiderName: outgoing.name,
        incomingRiderId: incoming.id,
        incomingRiderName: incoming.name,
        freezerCapacity: this.draft.freezerCapacity,
        cashCheck: { ...this.cashCheck },
        review: this.draft.review,
        acceptedCount: plan.accepted.length,
        retainedCount: plan.retained.length,
        usedSlots: plan.usedSlots,
        orders: [...plan.accepted.map(snap), ...plan.retained.map(snap)]
      };

      this.records.unshift(record);
      this.persistRecords();
      this.draft = freshDraft();
      this.persistDraft();
      return record;
    },

    nextSeq(): string {
      const now = new Date();
      const day = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(
        now.getDate()
      ).padStart(2, "0")}`;
      const countToday = this.records.filter((r) => r.seq.startsWith(`HB${day}`)).length + 1;
      return `HB${day}-${String(countToday).padStart(2, "0")}`;
    }
  }
});
