// 路线判断（纯逻辑层）
// 规则：
// 1. 先核现金、再评容量——本模块只负责「剩余路线顺序 + 冷冻格容量」。
// 2. 每个接班骑手单独评估：以车上已装冷链单数为起点，
//    按候选单的剩余站序从小到大逐单装格。
// 3. 非冷链单不占冷冻格，始终可以承接。
// 4. 冷链单装不下时该单留给原骑手，并给出原因；不影响后续其他单的评估。

import type { Rider } from "./types";

export class RouteError extends Error {}

export interface RouteOrder {
  orderId: string;
  code: string;
  toRiderId: string;
  cold: boolean;
  stopIndex: number;
}

export type OrderDecision =
  | { orderId: string; toRiderId: string; stopIndex: number; accepted: true }
  | {
      orderId: string;
      toRiderId: string;
      stopIndex: number;
      accepted: false;
      reason: string;
    };

export interface CapacityResult {
  /** 全部决策，按剩余路线顺序（stopIndex 升序）排列 */
  decisions: OrderDecision[];
  /** 评估完成后各接班骑手冷冻格占用：已有 + 本次承接 */
  occupiedByRider: Record<string, number>;
}

export function evaluateCapacity(
  candidateOrders: RouteOrder[],
  riders: Rider[],
): CapacityResult {
  const riderMap = new Map(riders.map((r) => [r.id, r]));
  const decisions: OrderDecision[] = [];
  const occupiedByRider: Record<string, number> = {};

  for (const order of candidateOrders) {
    const rider = riderMap.get(order.toRiderId);
    if (!rider) {
      throw new RouteError(`接班骑手不存在：${order.toRiderId}`);
    }
    if (rider.coldOnBoard > rider.freezerCapacity) {
      throw new RouteError(
        `骑手 ${rider.name} 车上冷链已超出冷冻格容量，请先核对车辆装载`,
      );
    }
  }

  // 每个接班骑手一个游标，按站序逐单装格
  const occupied = new Map(
    riders.map((r) => [r.id, r.coldOnBoard]),
  );

  const queue = [...candidateOrders].sort((a, b) => {
    if (a.stopIndex !== b.stopIndex) return a.stopIndex - b.stopIndex;
    return a.orderId.localeCompare(b.orderId);
  });

  for (const order of queue) {
    const rider = riderMap.get(order.toRiderId)!;
    const used = occupied.get(order.toRiderId)!;

    if (!order.cold) {
      decisions.push({
        orderId: order.orderId,
        toRiderId: order.toRiderId,
        stopIndex: order.stopIndex,
        accepted: true,
      });
      continue;
    }

    if (used < rider.freezerCapacity) {
      occupied.set(order.toRiderId, used + 1);
      decisions.push({
        orderId: order.orderId,
        toRiderId: order.toRiderId,
        stopIndex: order.stopIndex,
        accepted: true,
      });
    } else {
      decisions.push({
        orderId: order.orderId,
        toRiderId: order.toRiderId,
        stopIndex: order.stopIndex,
        accepted: false,
        reason: `冷冻格容量不足：${rider.name} 车上共 ${rider.freezerCapacity} 格、已占满（原有 ${rider.coldOnBoard} 单 + 本次已装 ${used - rider.coldOnBoard} 单），该冷链单装不下`,
      });
    }
  }

  for (const rider of riders) {
    occupiedByRider[rider.id] = occupied.get(rider.id)!;
  }

  return { decisions, occupiedByRider };
}
