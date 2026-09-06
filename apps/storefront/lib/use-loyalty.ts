"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "./api-client";

export interface LoyaltyStatus {
  linked: boolean;
  program: {
    name: string;
    rewardDescription: string;
    goalCount: number;
  } | null;
  account: {
    balance: number;
    stampsUntilReward: number;
    rewardAvailable: boolean;
  } | null;
}

export function useLoyalty(slug: string) {
  const [loyalty, setLoyalty] = useState<LoyaltyStatus | null>(null);

  useEffect(() => {
    let cancelled = false;
    apiFetch<{ loyalty: LoyaltyStatus }>(`/v1/public/restaurants/${slug}/loyalty/me`)
      .then((response) => {
        if (!cancelled) setLoyalty(response.loyalty);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [slug]);

  return loyalty;
}
