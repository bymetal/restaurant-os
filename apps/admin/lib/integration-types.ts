export type ConnectionState = "connecting" | "connected" | "disconnected";
export type WebhookState = "pending" | "configured" | "failing";

export interface WhatsAppConnection {
  id: string;
  provider: "evolution";
  instanceName: string;
  connectionState: ConnectionState;
  webhookState: WebhookState;
  phone: string | null;
  lastSeenAt: string | null;
}

export type QrCodeType = "ACQUISITION" | "LOYALTY_STATIC_ENTRY" | "TABLE" | "ORDER" | "CAMPAIGN";

export interface QrCode {
  id: string;
  type: QrCodeType;
  source: string;
  branchId: string | null;
  campaignId: string | null;
  tableNumber: string | null;
  sourceToken: string;
  active: boolean;
  createdAt: string;
  scanCount: number;
  customerCount: number;
}
