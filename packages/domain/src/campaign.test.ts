import { describe, expect, it } from "vitest";
import { calculateCampaignDiscount, canTransitionCampaign } from "./campaign.js";

describe("campaign domain rules", () => {
  it("allows only valid status transitions", () => {
    expect(canTransitionCampaign("draft", "active")).toBe(true);
    expect(canTransitionCampaign("completed", "active")).toBe(false);
    expect(canTransitionCampaign("active", "paused")).toBe(true);
    expect(canTransitionCampaign("archived", "active")).toBe(false);
  });

  it("calculates percentage discounts capped at the subtotal", () => {
    expect(calculateCampaignDiscount(10_000, { type: "percentage", value: 20 })).toBe(2_000);
    expect(calculateCampaignDiscount(500, { type: "fixed_amount", value: 1_000 })).toBe(500);
    expect(calculateCampaignDiscount(1_000, { type: "fixed_amount", value: 300 })).toBe(300);
  });
});
