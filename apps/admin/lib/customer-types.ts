export interface CustomerSummary {
  id: string;
  name: string | null;
  phone: string;
  segment: string;
  lastSeenAt: string | null;
  createdAt: string;
}

export interface CustomerDetail {
  id: string;
  name: string | null;
  phone: string;
  segment: string;
  acquisitionSource: string | null;
  preferredBranchId: string | null;
  preferredFulfillment: string | null;
  birthday: string | null;
  lastSeenAt: string | null;
  createdAt: string;
  metrics: {
    totalSpendMinor: number;
    totalSpendTrendPct: number;
    orderCount: number;
    orderCountTrendPct: number;
    avgBasketMinor: number;
    avgBasketTrendPct: number;
    lastOrder: { placedAt: string; totalMinor: number; branchName: string } | null;
  };
}

export interface LoyaltyStatus {
  linked: boolean;
  program: { id: string; name: string; rewardDescription: string; goalCount: number } | null;
  account: {
    balance: number;
    lifetimeEarned: number;
    lifetimeRedeemed: number;
    stampsUntilReward: number;
    rewardAvailable: boolean;
  } | null;
}

export interface FavoriteProduct {
  productId: string;
  productName: string;
  orderCount: number;
}

export interface TimelineEntry {
  kind: "order" | "loyalty" | "note";
  createdAt: string;
  detail: string;
  refId: string | null;
  amount: number | null;
}

export interface CustomerNote {
  id: string;
  body: string;
  createdAt: string;
}

export interface CustomerTag {
  id: string;
  label: string;
}

export interface OrderSummary {
  id: string;
  orderNumber: number;
  status: string;
  fulfillmentType: string;
  totalMinor: number;
  createdAt: string;
}
