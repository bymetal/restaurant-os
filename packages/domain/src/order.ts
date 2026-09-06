export const orderStatuses = [
  "DRAFT",
  "PLACED",
  "ACCEPTED",
  "PREPARING",
  "READY",
  "OUT_FOR_DELIVERY",
  "DELIVERED",
  "REJECTED",
  "CANCELLED",
  "REFUNDED"
] as const;

export type OrderStatus = (typeof orderStatuses)[number];
export type FulfillmentType = "delivery" | "pickup" | "dine_in";

export const orderTransitions: Record<OrderStatus, readonly OrderStatus[]> = {
  DRAFT: ["PLACED", "CANCELLED"],
  PLACED: ["ACCEPTED", "REJECTED", "CANCELLED"],
  ACCEPTED: ["PREPARING", "REJECTED", "CANCELLED"],
  PREPARING: ["READY", "REJECTED", "CANCELLED"],
  READY: ["OUT_FOR_DELIVERY", "DELIVERED", "CANCELLED"],
  OUT_FOR_DELIVERY: ["DELIVERED", "CANCELLED"],
  DELIVERED: ["REFUNDED"],
  REJECTED: [],
  CANCELLED: [],
  REFUNDED: []
};

export function canTransitionOrder(
  from: OrderStatus,
  to: OrderStatus,
  fulfillment: FulfillmentType
): boolean {
  if (!orderTransitions[from].includes(to)) return false;
  if (from === "READY" && to === "OUT_FOR_DELIVERY") return fulfillment === "delivery";
  if (from === "READY" && to === "DELIVERED") return fulfillment !== "delivery";
  if (from === "OUT_FOR_DELIVERY" && to === "DELIVERED") return fulfillment === "delivery";
  return true;
}

export function assertOrderTransition(
  from: OrderStatus,
  to: OrderStatus,
  fulfillment: FulfillmentType
): void {
  if (!canTransitionOrder(from, to, fulfillment)) {
    throw new Error(`Invalid order transition: ${from} -> ${to}`);
  }
}
