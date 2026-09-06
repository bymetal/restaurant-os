export interface LoyaltyProgramRules {
  goalCount: number;
  earnPerOrder: number;
  minOrderAmountMinor: number;
}

export function calculateStampsEarned(orderSubtotalMinor: number, rules: LoyaltyProgramRules): number {
  if (orderSubtotalMinor < rules.minOrderAmountMinor) return 0;
  return rules.earnPerOrder;
}

export function isRewardAvailable(balance: number, rules: LoyaltyProgramRules): boolean {
  return balance >= rules.goalCount;
}

export function stampsUntilReward(balance: number, rules: LoyaltyProgramRules): number {
  return Math.max(0, rules.goalCount - balance);
}

export function assertRedeemable(balance: number, rules: LoyaltyProgramRules): void {
  if (!isRewardAvailable(balance, rules)) {
    throw new Error("Loyalty balance has not reached the reward goal.");
  }
}
