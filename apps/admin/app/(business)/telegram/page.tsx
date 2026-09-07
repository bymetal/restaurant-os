"use client";

import { useCallback, useEffect, useState } from "react";
import { Send } from "lucide-react";
import { Badge, Button, Card, EmptyState, type BadgeTone } from "@restaurant-os/ui";
import { ApiError } from "../../../lib/api-client";
import { useAuth } from "../../../lib/auth-context";
import type { TelegramConnection } from "../../../lib/telegram-types";

const connectionTone: Record<TelegramConnection["connectionState"], BadgeTone> = {
  connected: "success",
  connecting: "warning",
  disconnected: "neutral"
};

const connectionLabel: Record<TelegramConnection["connectionState"], string> = {
  connected: "Bağlı",
  connecting: "Kod bekleniyor",
  disconnected: "Bağlı değil"
};

export default function TelegramPage() {
  const { authorizedFetch } = useAuth();
  const [connection, setConnection] = useState<TelegramConnection | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadConnection = useCallback(() => {
    authorizedFetch<{ connection: TelegramConnection | null }>("/v1/integrations/telegram").then((response) =>
      setConnection(response.connection)
    );
  }, [authorizedFetch]);

  useEffect(loadConnection, [loadConnection]);

  async function connect() {
    setBusy(true);
    setError(null);
    try {
      const response = await authorizedFetch<{ connection: TelegramConnection }>("/v1/integrations/telegram/connect", {
        method: "POST"
      });
      setConnection(response.connection);
    } catch (submitError) {
      setError(submitError instanceof ApiError ? submitError.message : "Telegram bağlantısı başlatılamadı.");
    } finally {
      setBusy(false);
    }
  }

  async function disconnect() {
    setBusy(true);
    setError(null);
    try {
      await authorizedFetch("/v1/integrations/telegram/disconnect", { method: "POST" });
      loadConnection();
    } catch (submitError) {
      setError(submitError instanceof ApiError ? submitError.message : "Bağlantı kesilemedi.");
    } finally {
      setBusy(false);
    }
  }

  const isLinking = connection?.connectionState === "connecting" && connection.linkCode;
  const isConnected = connection?.connectionState === "connected";

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold text-slate-900">Telegram</h1>

      <Card title="Sipariş Bildirimleri">
        {!connection || connection.connectionState === "disconnected" ? (
          <div className="space-y-3">
            <EmptyState
              icon={<Send size={24} />}
              title="Telegram bağlı değil"
              description="Yeni siparişleri restoranınızın Telegram grubuna otomatik bildirmek ve grup üzerinden sipariş durumunu yönetmek için bağlantı kurun."
            />
            {error && <p className="text-sm text-red-600">{error}</p>}
            <Button onClick={() => void connect()} disabled={busy}>
              {busy ? "Başlatılıyor..." : "Telegram Bağla"}
            </Button>
          </div>
        ) : isLinking ? (
          <div className="space-y-3">
            <Badge tone="warning">Kod bekleniyor</Badge>
            <ol className="list-decimal space-y-1 pl-5 text-sm text-slate-700">
              <li>
                Telegram&apos;da <span className="font-mono">@{connection.botUsername}</span> botunu restoranınızın grup sohbetine ekleyin.
              </li>
              <li>
                Grupta şu mesajı gönderin: <span className="font-mono font-semibold">/link {connection.linkCode}</span>
              </li>
            </ol>
            {connection.linkCodeExpiresAt && (
              <p className="text-xs text-slate-500">
                Kod şu zamana kadar geçerli: {new Date(connection.linkCodeExpiresAt).toLocaleTimeString("tr-TR")}
              </p>
            )}
            {error && <p className="text-sm text-red-600">{error}</p>}
            <div className="flex gap-2">
              <Button variant="outline" onClick={loadConnection}>
                Durumu Yenile
              </Button>
              <Button variant="outline" onClick={() => void connect()} disabled={busy}>
                Yeni Kod Al
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Badge tone={connectionTone[connection.connectionState]}>{connectionLabel[connection.connectionState]}</Badge>
              {isConnected && <span className="text-sm text-slate-600">@{connection.botUsername}</span>}
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => void disconnect()} disabled={busy}>
                Bağlantıyı Kes
              </Button>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
