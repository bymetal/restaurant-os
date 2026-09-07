export function parseTelegramLinkCommand(text: string): string | null {
  const match = /^\/link(?:@\w+)?\s+(\d{6})$/i.exec(text.trim());
  return match?.[1] ?? null;
}

export type TelegramOrderAction = "ACCEPTED" | "REJECTED" | "PREPARING" | "READY" | "OUT_FOR_DELIVERY" | "DELIVERED";

export interface ParsedTelegramCallback {
  orderId: string;
  toStatus: TelegramOrderAction;
}

const telegramOrderActions: readonly TelegramOrderAction[] = [
  "ACCEPTED",
  "REJECTED",
  "PREPARING",
  "READY",
  "OUT_FOR_DELIVERY",
  "DELIVERED"
];

export function parseTelegramCallbackData(data: string): ParsedTelegramCallback | null {
  const [prefix, orderId, toStatus] = data.split(":");
  if (prefix !== "ord" || !orderId || !toStatus) return null;
  if (!telegramOrderActions.includes(toStatus as TelegramOrderAction)) return null;
  return { orderId, toStatus: toStatus as TelegramOrderAction };
}

export function buildTelegramCallbackData(orderId: string, toStatus: TelegramOrderAction): string {
  return `ord:${orderId}:${toStatus}`;
}
