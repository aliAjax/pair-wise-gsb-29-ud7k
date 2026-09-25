// 交班记录层：骑手/订单数据、交班日志的读取与持久化（localStorage）。
// 只负责存取，不包含路线判断与现金规则——那些在 src/domain 里。

import { reactive, ref } from "vue";
import type { CompletedHandoff } from "../domain/handoff";
import type { Order, Rider } from "../domain/types";

const RIDER_KEY = "handover-desk-riders-v1";
const ORDER_KEY = "handover-desk-orders-v1";
const LOG_KEY = "handover-desk-logs-v1";

export interface HandoffLogEntry extends CompletedHandoff {
  /** 完成时刻的骑手姓名快照，避免之后改名导致记录失真 */
  riderNames: Record<string, string>;
}

const seedRiders: Rider[] = [
  { id: "R001", name: "王强（晚班）", freezerCapacity: 6, coldOnBoard: 2 },
  { id: "R002", name: "李敏", freezerCapacity: 4, coldOnBoard: 1 },
  { id: "R003", name: "赵磊", freezerCapacity: 3, coldOnBoard: 0 },
  { id: "R004", name: "周洋", freezerCapacity: 2, coldOnBoard: 1 },
];

const seedOrders: Order[] = [
  { id: "O1", code: "DD0925-01", address: "阳光花苑 3 栋", riderId: "R001", cold: true, cashCents: 5800, stopIndex: 1, status: "pending" },
  { id: "O2", code: "DD0925-02", address: "和平里 12 号", riderId: "R001", cold: false, cashCents: 3250, stopIndex: 2, status: "pending" },
  { id: "O3", code: "DD0925-03", address: "滨河路 88 号", riderId: "R001", cold: true, cashCents: 12600, stopIndex: 3, status: "pending" },
  { id: "O4", code: "DD0925-04", address: "东湖小区北门", riderId: "R001", cold: true, cashCents: 0, stopIndex: 4, status: "pending" },
  { id: "O5", code: "DD0925-05", address: "商业街口报刊亭", riderId: "R001", cold: false, cashCents: 8880, stopIndex: 5, status: "pending" },
  { id: "O6", code: "DD0925-06", address: "南郊冷链自提柜", riderId: "R001", cold: true, cashCents: 4500, stopIndex: 6, status: "pending" },
];

function load<T>(key: string, fallback: T): T {
  const raw = localStorage.getItem(key);
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

const riders = ref<Rider[]>(load(RIDER_KEY, seedRiders));
const orders = ref<Order[]>(load(ORDER_KEY, seedOrders));
const logs = ref<HandoffLogEntry[]>(load(LOG_KEY, []));

function persistRiders() {
  localStorage.setItem(RIDER_KEY, JSON.stringify(riders.value));
}
function persistOrders() {
  localStorage.setItem(ORDER_KEY, JSON.stringify(orders.value));
}
function persistLogs() {
  localStorage.setItem(LOG_KEY, JSON.stringify(logs.value));
}

export function useHandoverStore() {
  function riderName(id: string): string {
    return riders.value.find((r) => r.id === id)?.name ?? id;
  }

  /** 可接班骑手：除交班人外的全部骑手 */
  function successorCandidates(fromRiderId: string): Rider[] {
    return riders.value.filter((r) => r.id !== fromRiderId);
  }

  function pendingOrdersOf(riderId: string): Order[] {
    return orders.value
      .filter((o) => o.riderId === riderId && o.status === "pending")
      .sort((a, b) => a.stopIndex - b.stopIndex);
  }

  function updateRiderLoad(id: string, patch: Partial<Pick<Rider, "freezerCapacity" | "coldOnBoard" | "name">>) {
    const rider = riders.value.find((r) => r.id === id);
    if (!rider) return;
    Object.assign(rider, patch);
    persistRiders();
  }

  function addOrder(order: Omit<Order, "id" | "status">) {
    orders.value = [
      ...orders.value,
      { ...order, id: crypto.randomUUID(), status: "pending" },
    ];
    persistOrders();
  }

  /** 交班完成后落账：接单成功的单转给接班人；装不下的单留在原骑手 */
  function completeAndLog(record: CompletedHandoff): HandoffLogEntry {
    for (const result of record.results) {
      const order = orders.value.find((o) => o.id === result.orderId);
      if (!order) continue;
      if (result.accepted) {
        order.riderId = result.riderId;
        order.status = "handed";
      }
      // 未承接：riderId/status 均不变，即留在原骑手
    }
    persistOrders();

    const entry: HandoffLogEntry = {
      ...record,
      riderNames: Object.fromEntries(riders.value.map((r) => [r.id, r.name])),
    };
    logs.value = [entry, ...logs.value];
    persistLogs();
    return entry;
  }

  return reactive({
    riders,
    orders,
    logs,
    riderName,
    successorCandidates,
    pendingOrdersOf,
    updateRiderLoad,
    addOrder,
    completeAndLog,
  });
}
