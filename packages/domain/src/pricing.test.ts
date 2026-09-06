import { describe, expect, it } from "vitest";
import { calculateCartLineTotal, calculateCartUnitPrice } from "./pricing.js";

describe("cart snapshot pricing", () => {
  it("calculates from stored product, variant, and modifier snapshots", () => {
    const snapshot = {
      productUnitPrice: 280,
      variantPriceAdjustment: 40,
      modifierPriceAdjustments: [25, 15]
    };

    expect(calculateCartUnitPrice(snapshot)).toBe(360);
    expect(calculateCartLineTotal(snapshot, 2)).toBe(720);
  });

  it("rejects invalid quantities", () => {
    expect(() => calculateCartLineTotal({ productUnitPrice: 1, variantPriceAdjustment: 0, modifierPriceAdjustments: [] }, 0)).toThrow();
  });
});
