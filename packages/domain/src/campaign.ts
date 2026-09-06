export const campaignStatuses = ["draft", "scheduled", "active", "paused", "completed", "archived"] as const;
export type CampaignStatus = (typeof campaignStatuses)[number];

export const campaignTransitions: Record<CampaignStatus, readonly CampaignStatus[]> = {
  draft: ["scheduled", "active", "archived"],
  scheduled: ["active", "archived"],
  active: ["paused", "completed", "archived"],
  paused: ["active", "completed", "archived"],
  completed: [],
  archived: []
};

export function canTransitionCampaign(from: CampaignStatus, to: CampaignStatus): boolean {
  return campaignTransitions[from].includes(to);
}

export interface CampaignDiscountRule {
  type: "percentage" | "fixed_amount";
  value: number;
}

export function calculateCampaignDiscount(subtotalMinor: number, rule: CampaignDiscountRule): number {
  const raw = rule.type === "percentage" ? Math.floor((subtotalMinor * rule.value) / 100) : rule.value;
  return Math.max(0, Math.min(raw, subtotalMinor));
}
