/**
 * Evolution API client, coded against the documented v2 REST contract
 * (instance lifecycle, webhook registration, text sending). No live
 * Evolution instance was available while writing this adapter — per
 * AGENTS.md, verify these endpoints, payload shapes, and the
 * MESSAGES_UPSERT webhook body against the actually-deployed provider
 * version in staging before relying on it in production.
 */

export interface EvolutionConfig {
  baseUrl: string;
  globalApiKey: string;
}

export interface EvolutionInstance {
  instanceName: string;
  instanceId: string | null;
}

export type EvolutionConnectionState = "connecting" | "connected" | "disconnected";

export interface EvolutionQrCode {
  base64: string | null;
  pairingCode: string | null;
}

export class EvolutionApiError extends Error {
  constructor(
    public statusCode: number,
    message: string
  ) {
    super(message);
    this.name = "EvolutionApiError";
  }
}

export class EvolutionClient {
  constructor(private readonly config: EvolutionConfig) {}

  async createInstance(instanceName: string): Promise<EvolutionInstance> {
    const body = await this.request<{ instance?: { instanceId?: string } }>("POST", "/instance/create", {
      instanceName,
      qrcode: true,
      integration: "WHATSAPP-BAILEYS"
    });
    return { instanceName, instanceId: body.instance?.instanceId ?? null };
  }

  async setWebhook(instanceName: string, webhookUrl: string): Promise<void> {
    await this.request("POST", `/webhook/set/${encodeURIComponent(instanceName)}`, {
      webhook: {
        url: webhookUrl,
        enabled: true,
        events: ["MESSAGES_UPSERT", "CONNECTION_UPDATE"]
      }
    });
  }

  async getConnectionState(instanceName: string): Promise<EvolutionConnectionState> {
    const body = await this.request<{ instance?: { state?: string } }>(
      "GET",
      `/instance/connectionState/${encodeURIComponent(instanceName)}`
    );
    const state = body.instance?.state;
    if (state === "open") return "connected";
    if (state === "connecting") return "connecting";
    return "disconnected";
  }

  async getQrCode(instanceName: string): Promise<EvolutionQrCode> {
    const body = await this.request<{ base64?: string; pairingCode?: string }>(
      "GET",
      `/instance/connect/${encodeURIComponent(instanceName)}`
    );
    return { base64: body.base64 ?? null, pairingCode: body.pairingCode ?? null };
  }

  async logoutInstance(instanceName: string): Promise<void> {
    await this.request("DELETE", `/instance/logout/${encodeURIComponent(instanceName)}`);
  }

  async sendText(instanceName: string, phone: string, text: string): Promise<void> {
    await this.request("POST", `/message/sendText/${encodeURIComponent(instanceName)}`, {
      number: phone,
      text
    });
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const init: RequestInit = {
      method,
      headers: {
        "Content-Type": "application/json",
        apikey: this.config.globalApiKey
      }
    };
    if (body !== undefined) init.body = JSON.stringify(body);
    const response = await fetch(`${this.config.baseUrl}${path}`, init);
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      const message = (payload as { message?: string } | null)?.message ?? `Evolution API request failed (${response.status}).`;
      throw new EvolutionApiError(response.status, message);
    }
    return payload as T;
  }
}
