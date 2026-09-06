export interface OrderTotalsInput {
  subtotalMinor: number;
  deliveryFeeMinor?: number;
  discountMinor?: number;
  taxMinor?: number;
}

export interface OrderTotals {
  subtotalMinor: number;
  deliveryFeeMinor: number;
  discountMinor: number;
  taxMinor: number;
  totalMinor: number;
}

export function calculateOrderTotals(input: OrderTotalsInput): OrderTotals {
  const totals = {
    subtotalMinor: input.subtotalMinor,
    deliveryFeeMinor: input.deliveryFeeMinor ?? 0,
    discountMinor: input.discountMinor ?? 0,
    taxMinor: input.taxMinor ?? 0
  };
  for (const [name, value] of Object.entries(totals)) {
    if (!Number.isInteger(value) || value < 0) throw new Error(`${name} must be a non-negative integer.`);
  }
  if (totals.discountMinor > totals.subtotalMinor + totals.deliveryFeeMinor + totals.taxMinor) {
    throw new Error("Discount cannot exceed the order amount.");
  }
  return {
    ...totals,
    totalMinor:
      totals.subtotalMinor + totals.deliveryFeeMinor + totals.taxMinor - totals.discountMinor
  };
}
