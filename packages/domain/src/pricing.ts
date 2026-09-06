export interface PriceSnapshot {
  productUnitPrice: number;
  variantPriceAdjustment: number;
  modifierPriceAdjustments: number[];
}

export function calculateCartUnitPrice(snapshot: PriceSnapshot): number {
  return snapshot.productUnitPrice +
    snapshot.variantPriceAdjustment +
    snapshot.modifierPriceAdjustments.reduce((sum, adjustment) => sum + adjustment, 0);
}

export function calculateCartLineTotal(snapshot: PriceSnapshot, quantity: number): number {
  if (!Number.isInteger(quantity) || quantity <= 0) throw new Error("Quantity must be a positive integer.");
  return calculateCartUnitPrice(snapshot) * quantity;
}
