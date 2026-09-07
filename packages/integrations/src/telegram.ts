/**
 * Telegram Bot API client. Unlike Evolution (self-hosted, semi-documented),
 * the Telegram Bot API is official and stable (https://core.telegram.org/bots/api),
 * so this adapter is expected to work as written. Still verify `setWebhook`'s
 * `secret_token` support and the exact `callback_query`/`message` update shapes
 * against the live bot in staging before relying on them, per AGENTS.md.
 */

export interface TelegramConfig {
  botToken: string;
}

export interface TelegramBotIdentity {
  id: number;
  username: string | null;
}

export interface TelegramInlineKeyboardButton {
  text: string;
  callback_data: string;
}

export class TelegramApiError extends Error {
  constructor(
    public statusCode: number,
    message: string
  ) {
    super(message);
    this.name = "TelegramApiError";
  }
}

export class TelegramClient {
  constructor(private readonly config: TelegramConfig) {}

  async getMe(): Promise<TelegramBotIdentity> {
    const result = await this.request<{ id: number; username?: string }>("getMe");
    return { id: result.id, username: result.username ?? null };
  }

  async setWebhook(url: string, secretToken: string): Promise<void> {
    await this.request("setWebhook", {
      url,
      secret_token: secretToken,
      allowed_updates: ["message", "callback_query"]
    });
  }

  async sendMessage(chatId: string, text: string, replyMarkup?: TelegramInlineKeyboardButton[][]): Promise<{ messageId: number }> {
    const result = await this.request<{ message_id: number }>("sendMessage", {
      chat_id: chatId,
      text,
      reply_markup: replyMarkup ? { inline_keyboard: replyMarkup } : undefined
    });
    return { messageId: result.message_id };
  }

  async answerCallbackQuery(callbackQueryId: string, text?: string, showAlert = false): Promise<void> {
    await this.request("answerCallbackQuery", { callback_query_id: callbackQueryId, text, show_alert: showAlert });
  }

  async editMessageReplyMarkup(chatId: string, messageId: number, replyMarkup: TelegramInlineKeyboardButton[][] | null): Promise<void> {
    await this.request("editMessageReplyMarkup", {
      chat_id: chatId,
      message_id: messageId,
      reply_markup: replyMarkup ? { inline_keyboard: replyMarkup } : undefined
    });
  }

  private async request<T>(method: string, body?: Record<string, unknown>): Promise<T> {
    const response = await fetch(`https://api.telegram.org/bot${this.config.botToken}/${method}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body ?? {}),
      signal: AbortSignal.timeout(5_000)
    });
    const payload = (await response.json().catch(() => null)) as { ok?: boolean; result?: T; description?: string } | null;
    if (!response.ok || !payload?.ok) {
      throw new TelegramApiError(response.status, payload?.description ?? `Telegram API request failed (${response.status}).`);
    }
    return payload.result as T;
  }
}
