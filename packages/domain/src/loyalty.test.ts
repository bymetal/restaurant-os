import { describe, expect, it } from "vitest";
import {
  assertRedeemable,
  calculateStampsEarned,
  isRewardAvailable,
  stampsUntilReward,
  type LoyaltyProgramRules
} from "./loyalty.js";

const rules: LoyaltyProgramRules = { goalCount: 10, earnPerOrder: 1, minOrderAmountMinor: 5_000 };

describe("loyalty domain rules", () => {
  it("earns stamps only when the minimum order amount is met", () => {
    expect(calculateStampsEarned(4_999, rules)).toBe(0);
    expect(calculateStampsEarned(5_000, rules)).toBe(1);
    expect(calculateStampsEarned(20_000, { ...rules, earnPerOrder: 2 })).toBe(2);
  });

  it("reports reward availability and remaining stamps", () => {
    expect(isRewardAvailable(9, rules)).toBe(false);
    expect(isRewardAvailable(10, rules)).toBe(true);
    expect(stampsUntilReward(7, rules)).toBe(3);
    expect(stampsUntilReward(12, rules)).toBe(0);
  });

  it("throws when redeeming below the goal", () => {
    expect(() => assertRedeemable(9, rules)).toThrow();
    expect(() => assertRedeemable(10, rules)).not.toThrow();
  });
});
