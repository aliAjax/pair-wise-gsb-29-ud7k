/** 骑手 */
export interface Rider {
  id: string;
  name: string;
  /** 是否为班长（现金差额复核人） */
  isLeader: boolean;
}

/** 未送完的在途订单（交班前编辑中的工作数据） */
export interface PendingOrder {
  id: string;
  /** 订单号/客户摘要 */
  label: string;
  /** 剩余路线上的站点序号，从 1 开始，按它排序承接 */
  stopIndex: number;
  /** 是否冷链单（占用车上冷冻格） */
  cold: boolean;
  /** 占用冷冻格数，非冷链单为 0 */
  freezerSlots: number;
  /** 已向客户收取的现金，单位：分 */
  cashCollectedFen: number;
}

/** 路线规划结果中的单条订单 */
export interface PlannedOrder extends PendingOrder {
  /** 计划承接骑手；留在原骑手时为原骑手姓名 */
  carrierName: string;
  accepted: boolean;
  /** 承接后冷冻格占用合计（仅累计冷链单） */
  usedSlotsAfter?: number;
  /** 留在原骑手的原因 */
  reason?: string;
}

/** 路线判断结果（纯函数产物，不持久化） */
export interface RoutePlan {
  accepted: PlannedOrder[];
  retained: PlannedOrder[];
  /** 承接后冷冻格总占用 */
  usedSlots: number;
  /** 接班骑手冷冻格容量 */
  freezerCapacity: number;
  /** 是否能全部装下 */
  allFit: boolean;
}

/** 现金核平结果 */
export interface CashCheck {
  /** 各单已收现金合计，单位：分 */
  expectedFen: number;
  /** 交班骑手实际上交现金，单位：分 */
  submittedFen: number;
  /** 差额 = 上交 - 应收，单位：分 */
  diffFen: number;
  balanced: boolean;
}

/** 班长复核记录 */
export interface LeaderReview {
  leaderId: string;
  leaderName: string;
  comment: string;
  reviewedAt: string;
}

/** 完成换班后封存的订单快照 */
export interface OrderSnapshot {
  orderId: string;
  label: string;
  stopIndex: number;
  cold: boolean;
  freezerSlots: number;
  cashCollectedFen: number;
  carrierName: string;
  accepted: boolean;
  reason?: string;
}

/** 一条交班记录（持久化） */
export interface HandoverRecord {
  id: string;
  seq: string;
  createdAt: string;
  outgoingRiderId: string;
  outgoingRiderName: string;
  incomingRiderId: string;
  incomingRiderName: string;
  freezerCapacity: number;
  cashCheck: CashCheck;
  /** 现金有差额时存在，表示已经班长复核放行 */
  review?: LeaderReview;
  acceptedCount: number;
  retainedCount: number;
  usedSlots: number;
  orders: OrderSnapshot[];
}

/** 交接工作流阶段 */
export type Stage = "cash" | "route" | "done";

/** 未完成交班的编辑草稿（持久化，防止刷新丢失） */
export interface Draft {
  outgoingRiderId: string;
  incomingRiderId: string;
  freezerCapacity: number;
  submittedFen: number;
  orders: PendingOrder[];
  stage: Stage;
  /** 现金差额是否已经班长放行（只在当前草稿有效） */
  released: boolean;
  review?: LeaderReview;
}
