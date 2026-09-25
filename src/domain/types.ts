// 共享领域模型：骑手、订单、交班指派
// 金额一律以「分」存储，避免浮点误差；页面展示时再转「元」。

export type OrderStatus = "pending" | "handed" | "delivered";

export interface Order {
  id: string;
  /** 订单号，展示用 */
  code: string;
  address: string;
  /** 当前持有该单的骑手（交班时即原骑手） */
  riderId: string;
  /** 是否冷链单（需要占用冷冻格） */
  cold: boolean;
  /** 已收现金，单位：分 */
  cashCents: number;
  /** 剩余路线顺序，数字越小越先送达，从 1 开始 */
  stopIndex: number;
  status: OrderStatus;
}

export interface Rider {
  id: string;
  name: string;
  /** 车上冷冻格总容量（格数，一格放一单冷链） */
  freezerCapacity: number;
  /** 交接发生时车上已装的冷链单数 */
  coldOnBoard: number;
}

export interface Assignment {
  orderId: string;
  toRiderId: string;
}
