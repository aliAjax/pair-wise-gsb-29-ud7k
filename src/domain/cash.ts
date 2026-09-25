// 现金核对（纯逻辑层）
// 场景：收来的现金混在原骑手个人账户里，交班时逐单确认已收现金，
// 接班人把对应现金（线下转交）核平。录入实交现金与订单已收总额对比：
// 一致 => 核平；有差额 => 停在班长复核，未放行前不能进入容量确认。

export const CENTS_PER_YUAN = 100;

export function yuanToCents(yuan: number): number {
  return Math.round(yuan * CENTS_PER_YUAN);
}

export function centsToYuan(cents: number): number {
  return cents / CENTS_PER_YUAN;
}

export function formatYuan(cents: number): string {
  return `¥${centsToYuan(cents).toFixed(2)}`;
}

export interface CashOrder {
  orderId: string;
  cashCents: number;
}

export interface CashCheckResult {
  /** 待交接订单的已收现金合计，单位：分 */
  expectedCents: number;
  /** 接班人/班长录入的实交现金，单位：分 */
  submittedCents: number;
  /** 差额 = 实交 - 应收；为 0 表示核平 */
  diffCents: number;
  balanced: boolean;
}

export function checkCash(
  orders: CashOrder[],
  submittedCents: number,
): CashCheckResult {
  const expectedCents = orders.reduce((sum, o) => sum + o.cashCents, 0);
  const diffCents = submittedCents - expectedCents;
  return {
    expectedCents,
    submittedCents,
    diffCents,
    balanced: diffCents === 0,
  };
}
