// 交班流程状态机（纯逻辑层）
// 流程闸门：现金核平 -> 容量确认 -> 班长复核(仅差额时) -> 完成换班
//
// 状态说明：
//   cash       现金核对中：逐单登记已收现金、录入实交金额
//   review     班长复核：现金有差额，停在这里等班长复核放行
//   capacity   容量确认：现金已核平（或差额已放行），按路线顺序评冷冻格
//   done       换班完成：接单成功的单转给接班人，装不下的留在原骑手并写明原因
//
// 班长只能「放行」差额（登记复核意见，按实交金额记账），不能直接把差额改成 0；
// 未放行前禁止进入容量确认与完成。

import { checkCash, type CashCheckResult } from "./cash";
import { evaluateCapacity, type CapacityResult, type OrderDecision } from "./route";
import type { Assignment, Order, Rider } from "./types";

export type HandoffStage = "cash" | "review" | "capacity" | "done";

export interface HandoffOrderRow {
  order: Order;
  toRiderId: string;
  /** 该单登记的已收现金，默认取订单上的 cashCents，可在台上修正 */
  cashCents: number;
}

export interface SupervisorReview {
  name: string;
  opinion: string;
  reviewedAt: string;
}

export interface HandoffState {
  id: string;
  stage: HandoffStage;
  fromRiderId: string;
  rows: HandoffOrderRow[];
  submittedCents: number;
  cash: CashCheckResult | null;
  review: SupervisorReview | null;
  capacity: CapacityResult | null;
}

export class HandoffError extends Error {}

let seq = 0;
export function createHandoff(fromRiderId: string, orders: Order[]): HandoffState {
  if (orders.length === 0) {
    throw new HandoffError("该骑手没有待交接的订单");
  }
  const riders = new Set(orders.map((o) => o.riderId));
  if (riders.size !== 1 || !riders.has(fromRiderId)) {
    throw new HandoffError("交接订单必须全部属于同一名原骑手");
  }
  return {
    id: `HO-${Date.now()}-${(seq += 1)}`,
    stage: "cash",
    fromRiderId,
    rows: orders.map((order) => ({
      order,
      toRiderId: "",
      cashCents: order.cashCents,
    })),
    submittedCents: orders.reduce((s, o) => s + o.cashCents, 0),
    cash: null,
    review: null,
    capacity: null,
  };
}

export function setAssignee(state: HandoffState, orderId: string, toRiderId: string) {
  const row = state.rows.find((r) => r.order.id === orderId);
  if (!row) throw new HandoffError("订单不在本次交接中");
  row.toRiderId = toRiderId;
}

/** 提交现金核对：核平进容量闸门；有差额停在班长复核 */
export function submitCash(state: HandoffState): HandoffState {
  if (state.stage !== "cash" && state.stage !== "review") {
    throw new HandoffError("当前阶段不能提交现金");
  }
  const result = checkCash(
    state.rows.map((r) => ({ orderId: r.order.id, cashCents: r.cashCents })),
    state.submittedCents,
  );
  state.cash = result;
  state.stage = result.balanced ? "capacity" : "review";
  return state;
}

/** 班长复核放行（仅在有差额的 review 阶段） */
export function approveReview(
  state: HandoffState,
  review: Omit<SupervisorReview, "reviewedAt">,
): HandoffState {
  if (state.stage !== "review") {
    throw new HandoffError("只有停在班长复核时才能放行");
  }
  if (!review.name.trim() || !review.opinion.trim()) {
    throw new HandoffError("请填写班长姓名和复核意见");
  }
  state.review = { ...review, reviewedAt: new Date().toISOString() };
  state.stage = "capacity";
  return state;
}

/** 现金被退回重核：撤销放行，回到现金核对 */
export function reopenCash(state: HandoffState): HandoffState {
  if (state.stage !== "review" && state.stage !== "capacity") {
    throw new HandoffError("当前阶段不能退回重核");
  }
  state.stage = "cash";
  state.review = null;
  state.capacity = null;
  return state;
}

/** 按剩余路线顺序 + 冷冻格容量确认能否承接 */
export function confirmCapacity(state: HandoffState, riders: Rider[]): HandoffState {
  if (state.stage !== "capacity") {
    throw new HandoffError("现金未核平/未放行，不能进行容量确认");
  }
  if (state.rows.some((r) => !r.toRiderId)) {
    throw new HandoffError("每单都要指定接班骑手后才能确认");
  }

  const candidates = state.rows.map((r) => ({
    orderId: r.order.id,
    code: r.order.code,
    toRiderId: r.toRiderId,
    cold: r.order.cold,
    stopIndex: r.order.stopIndex,
  }));
  state.capacity = evaluateCapacity(candidates, riders);
  return state;
}

export interface CompletedOrderResult {
  orderId: string;
  code: string;
  /** 实际承接骑手；装不下时为原骑手 */
  riderId: string;
  cold: boolean;
  stopIndex: number;
  accepted: boolean;
  reason: string;
}

export interface CompletedHandoff {
  id: string;
  fromRiderId: string;
  finishedAt: string;
  cash: CashCheckResult;
  review: SupervisorReview | null;
  results: CompletedOrderResult[];
  acceptedCount: number;
  retainedCount: number;
}

/** 完成换班：返回可落库的交班记录与订单转移结果 */
export function completeHandoff(state: HandoffState): CompletedHandoff {
  if (state.stage !== "capacity" || !state.capacity || !state.cash) {
    throw new HandoffError("容量尚未确认，不能完成换班");
  }
  const decisionMap = new Map<string, OrderDecision>(
    state.capacity.decisions.map((d) => [d.orderId, d]),
  );

  const results: CompletedOrderResult[] = state.rows.map((row) => {
    const decision = decisionMap.get(row.order.id);
    if (!decision) throw new HandoffError("容量结果缺失，禁止完成");
    return {
      orderId: row.order.id,
      code: row.order.code,
      riderId: decision.accepted ? row.toRiderId : state.fromRiderId,
      cold: row.order.cold,
      stopIndex: row.order.stopIndex,
      accepted: decision.accepted,
      reason: decision.accepted ? "" : decision.reason,
    };
  });

  return {
    id: state.id,
    fromRiderId: state.fromRiderId,
    finishedAt: new Date().toISOString(),
    cash: state.cash,
    review: state.review,
    results,
    acceptedCount: results.filter((r) => r.accepted).length,
    retainedCount: results.filter((r) => !r.accepted).length,
  };
}

export { checkCash };
export type { Assignment };
