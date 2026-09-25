import type { CashCheck, PendingOrder, PlannedOrder, RoutePlan } from "../types";

/**
 * 现金核平：各单已收现金合计 vs 交班骑手实际上交。
 * 差额 = 上交 - 应收；为 0 才算核平。
 */
export function checkCash(orders: PendingOrder[], submittedFen: number): CashCheck {
  const expectedFen = orders.reduce((sum, order) => sum + order.cashCollectedFen, 0);
  const diffFen = submittedFen - expectedFen;
  return { expectedFen, submittedFen, diffFen, balanced: diffFen === 0 };
}

/**
 * 路线判断（纯函数，不读写页面与存储）：
 * 1. 按剩余路线站点顺序（stopIndex 升序）逐单确认；
 * 2. 常温单不占冷冻格，冷链单累计占用 freezerSlots；
 * 3. 某一冷链单装不下当前剩余冷冻格时，留在原骑手并写明原因，
 *    后续站点继续判断（留下的单不占格）。
 */
export function planRoute(
  orders: PendingOrder[],
  incomingName: string,
  outgoingName: string,
  freezerCapacity: number
): RoutePlan {
  const accepted: PlannedOrder[] = [];
  const retained: PlannedOrder[] = [];
  let usedSlots = 0;

  const sorted = [...orders].sort((a, b) => a.stopIndex - b.stopIndex);

  for (const order of sorted) {
    if (!order.cold) {
      accepted.push({ ...order, carrierName: incomingName, accepted: true });
      continue;
    }

    const remainSlots = freezerCapacity - usedSlots;
    if (order.freezerSlots <= remainSlots) {
      usedSlots += order.freezerSlots;
      accepted.push({
        ...order,
        carrierName: incomingName,
        accepted: true,
        usedSlotsAfter: usedSlots
      });
    } else {
      retained.push({
        ...order,
        carrierName: outgoingName,
        accepted: false,
        reason: `冷冻格不足：本单需 ${order.freezerSlots} 格，接班车上仅剩 ${remainSlots} 格（路线第 ${order.stopIndex} 站），留在原骑手配送`
      });
    }
  }

  return {
    accepted,
    retained,
    usedSlots,
    freezerCapacity,
    allFit: retained.length === 0
  };
}
