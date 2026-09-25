/** 金额统一以「分」存储，页面输入/展示时换算，避免浮点误差 */

/** 元(字符串/数字) → 分 */
export function yuanToFen(yuan: number | string): number {
  const n = typeof yuan === "string" ? Number.parseFloat(yuan) : yuan;
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100);
}

/** 分 → 元（数字） */
export function fenToYuan(fen: number): number {
  return fen / 100;
}

/** 分 → 展示文本，如 +12.50 / -3.00 */
export function formatFen(fen: number, withSign = false): string {
  const sign = withSign && fen > 0 ? "+" : fen < 0 ? "-" : "";
  const abs = Math.abs(fen) / 100;
  return `${sign}¥${abs.toFixed(2)}`;
}
