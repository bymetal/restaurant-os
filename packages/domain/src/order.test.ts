import { describe, expect, it } from "vitest";
import { assertOrderTransition, canTransitionOrder } from "./order.js";
import { calculateDeliveryFee } from "./delivery.js";
import { calculateOrderTotals } from "./totals.js";

describe("order domain rules", () => {
  it("allows only valid fulfillment transitions", () => {
    expect(canTransitionOrder("PLACED", "ACCEPTED", "pickup")).toBe(true);
    expect(canTransitionOrder("READY", "OUT_FOR_DELIVERY", "pickup")).toBe(false);
    expect(canTransitionOrder("DELIVERED", "PREPARING", "delivery")).toBe(false);
    expect(() => assertOrderTransition("DELIVERED", "PREPARING", "delivery")).toThrow();
  });

  it("calculates integer minor-unit totals", () => {
    expect(calculateOrderTotals({ subtotalMinor: 1_000, deliveryFeeMinor: 100, taxMinor: 20, discountMinor: 50 })).toEqual({
      subtotalMinor: 1_000,
      deliveryFeeMinor: 100,
      taxMinor: 20,
      discountMinor: 50,
      totalMinor: 1_070
    });
  });

  it("applies delivery minimum and free-delivery threshold", () => {
    expect(() => calculateDeliveryFee({ subtotalMinor: 500, deliveryFeeMinor: 100, minOrderMinor: 600 })).toThrow();
    expect(calculateDeliveryFee({ subtotalMinor: 1_000, deliveryFeeMinor: 100, freeDeliveryThresholdMinor: 1_000 })).toBe(0);
  });
});
