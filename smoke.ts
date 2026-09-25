// 领域逻辑冒烟测试：现金闸门 + 班长放行 + 站序装格 + 留单 + 完成换班
import { createHandoff, submitCash, approveReview, reopenCash, confirmCapacity, completeHandoff, HandoffError } from "./src/domain/handoff";
import type { Order, Rider } from "./src/domain/types";

let passed = 0;
function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error("断言失败: " + msg);
  passed++;
}

const riders: Rider[] = [
  { id: "A", name: "原骑手", freezerCapacity: 6, coldOnBoard: 0 },
  { id: "B", name: "接班人小李", freezerCapacity: 2, coldOnBoard: 1 }, // 只剩 1 格
  { id: "C", name: "接班人小张", freezerCapacity: 3, coldOnBoard: 0 },
];

const orders: Order[] = [
  { id: "o1", code: "1", address: "x", riderId: "A", cold: false, cashCents: 1000, stopIndex: 2, status: "pending" },
  { id: "o2", code: "2", address: "x", riderId: "A", cold: true,  cashCents: 2050, stopIndex: 1, status: "pending" },
  { id: "o3", code: "3", address: "x", riderId: "A", cold: true,  cashCents: 0,    stopIndex: 3, status: "pending" },
];

// 1) 有差额时必须停在复核，且不能做容量确认
let h = createHandoff("A", orders);
h.submittedCents = 3000; // 应收 3050，短款 50
submitCash(h);
assert(h.stage === "review", "现金有差额应停在班长复核");
let blocked = false;
try { confirmCapacity(h, riders); } catch (e) { blocked = e instanceof HandoffError; }
assert(blocked, "未放行时容量确认应被拒绝");

// 2) 班长不放行不能过；信息不全也不能过
let blocked2 = false;
try { approveReview(h, { name: "", opinion: "" }); } catch { blocked2 = true; }
assert(blocked2, "班长姓名/意见为空时不得放行");
approveReview(h, { name: "马班长", opinion: "短款50当场补平" });
assert(h.stage === "capacity", "班长放行后进入容量确认");

// 3) 退回重核会撤销放行
h = createHandoff("A", orders);
h.submittedCents = 3050;
submitCash(h);
assert(h.stage === "capacity", "现金核平直接进入容量确认");
reopenCash(h);
assert(h.stage === "cash" && h.review === null, "退回重核应清除复核记录");
submitCash(h);

// 4) 站序装格：o2(冷链,站1) -> B 占掉 B 最后一格；o3(冷链,站3) -> B 装不下留原骑手；o1 常温可接
import { setAssignee } from "./src/domain/handoff";
setAssignee(h, "o1", "B");
setAssignee(h, "o2", "B");
setAssignee(h, "o3", "B");
confirmCapacity(h, riders);
const byId = Object.fromEntries(h.capacity!.decisions.map((d) => [d.orderId, d]));
assert(byId.o2.accepted === true, "站序1的冷链单应装入B唯一空格");
assert(byId.o1.accepted === true, "常温单不占冷冻格，应可承接");
assert(byId.o3.accepted === false && /冷冻格容量不足/.test((byId.o3 as any).reason), "站序3冷链单装不下应留原骑手并写明原因");
// 决策必须按站序排列
assert(h.capacity!.decisions.map((d) => d.stopIndex).join(",") === "1,2,3", "决策应按剩余路线顺序排列");

// 5) 未确认容量不能完成
let h2 = createHandoff("A", orders);
h2.submittedCents = 3050;
submitCash(h2);
let blocked3 = false;
try { completeHandoff(h2); } catch { blocked3 = true; }
assert(blocked3, "容量未确认不得完成换班");

// 6) 完成换班：o3 留在 A，其余转给 B；记录带班长意见场景单独构造
const record = completeHandoff(h);
assert(record.acceptedCount === 2 && record.retainedCount === 1, "完成时统计 2 转 1 留");
assert(record.results.find((r) => r.orderId === "o3")!.riderId === "A", "装不下的单留在原骑手A");
assert(record.results.find((r) => r.orderId === "o2")!.riderId === "B", "接单成功的单转给B");
assert(record.cash.diffCents === 0, "现金核平记录差额为0");

// 7) 每单必须指定接班人
let h3 = createHandoff("A", orders);
h3.submittedCents = 3050;
submitCash(h3);
let blocked4 = false;
try { confirmCapacity(h3, riders); } catch { blocked4 = true; }
assert(blocked4, "存在未指定接班人的单时容量确认应被拒绝");

console.log(`全部通过：${passed} 项断言`);
