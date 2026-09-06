export interface DeliveryFeeInput {
  subtotalMinor: number;
  deliveryFeeMinor: number;
  minOrderMinor?: number | null;
  freeDeliveryThresholdMinor?: number | null;
}

export function calculateDeliveryFee(input: DeliveryFeeInput): number {
  if (input.subtotalMinor < 0 || input.deliveryFeeMinor < 0) {
    throw new Error("Delivery values must be non-negative.");
  }
  if (input.minOrderMinor !== null && input.minOrderMinor !== undefined && input.subtotalMinor < input.minOrderMinor) {
    throw new Error("Order minimum has not been reached.");
  }
  if (
    input.freeDeliveryThresholdMinor !== null &&
    input.freeDeliveryThresholdMinor !== undefined &&
    input.subtotalMinor >= input.freeDeliveryThresholdMinor
  ) {
    return 0;
  }
  return input.deliveryFeeMinor;
}
