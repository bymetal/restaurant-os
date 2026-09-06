export type CampaignStatus = "draft" | "scheduled" | "active" | "paused" | "completed" | "archived";

export interface Campaign {
  id: string;
  name: string;
  description: string | null;
  discountType: "percentage" | "fixed_amount";
  discountValue: number;
  couponCode: string;
  minOrderAmountMinor: number;
  maxRedemptions: number | null;
  redemptionCount: number;
  status: CampaignStatus;
  startsAt: string;
  endsAt: string | null;
  createdAt: string;
}

export interface CampaignPerformance {
  campaignId: string;
  name: string;
  redemptionCount: number;
  revenueMinor: number;
  discountMinor: number;
}
