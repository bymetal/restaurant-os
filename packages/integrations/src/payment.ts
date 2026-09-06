export type OfflinePaymentMethod = "cash" | "card_on_delivery" | "pay_at_restaurant";

export interface PaymentRequest {
  amountMinor: number;
  currency: string;
  method: OfflinePaymentMethod;
  orderId: string;
}

export interface PaymentResult {
  status: "CAPTURED_OFFLINE";
  provider: "offline";
  providerPaymentId: null;
}

export interface PaymentAdapter {
  createPayment(request: PaymentRequest): Promise<PaymentResult>;
  verifyWebhook(payload: unknown, signature: string | undefined): Promise<never>;
  capture(paymentId: string): Promise<never>;
  refund(paymentId: string): Promise<never>;
  getStatus(paymentId: string): Promise<"CAPTURED_OFFLINE">;
}

export class OfflinePaymentAdapter implements PaymentAdapter {
  async createPayment(request: PaymentRequest): Promise<PaymentResult> {
    if (!Number.isInteger(request.amountMinor) || request.amountMinor < 0) {
      throw new Error("Payment amount must be a non-negative integer.");
    }
    return { status: "CAPTURED_OFFLINE", provider: "offline", providerPaymentId: null };
  }

  async verifyWebhook(): Promise<never> {
    throw new Error("Offline payments do not accept webhooks.");
  }

  async capture(): Promise<never> {
    throw new Error("Offline payments are captured at checkout.");
  }

  async refund(): Promise<never> {
    throw new Error("Offline payment refunds require a future payment adapter.");
  }

  async getStatus(): Promise<"CAPTURED_OFFLINE"> {
    return "CAPTURED_OFFLINE";
  }
}
