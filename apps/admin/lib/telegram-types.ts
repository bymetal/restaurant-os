export type TelegramConnectionState = "connecting" | "connected" | "disconnected";

export interface TelegramConnection {
  id: string;
  connectionState: TelegramConnectionState;
  botUsername: string | null;
  chatId: string | null;
  linkCode: string | null;
  linkCodeExpiresAt: string | null;
  lastSeenAt: string | null;
}
