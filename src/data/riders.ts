import type { Rider } from "../types";

/** 骑手花名册（演示数据；班长负责现金差额复核） */
export const RIDERS: Rider[] = [
  { id: "r-a", name: "骑手A（王强）", isLeader: false },
  { id: "r-b", name: "骑手B（李娜）", isLeader: false },
  { id: "r-c", name: "骑手C（赵磊）", isLeader: false },
  { id: "r-d", name: "骑手D（陈敏）", isLeader: false },
  { id: "r-lead", name: "班长（孙队）", isLeader: true }
];

export function riderById(id: string): Rider | undefined {
  return RIDERS.find((r) => r.id === id);
}
