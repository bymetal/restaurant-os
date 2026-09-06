"use client";

import { useEffect, useState } from "react";
import { Card } from "@restaurant-os/ui";
import { useAuth } from "../../../lib/auth-context";
import { formatDateTime } from "../../../lib/format";
import type { AuditLogEntry } from "../../../lib/platform-types";

export default function AuditLogsPage() {
  const { authorizedFetch } = useAuth();
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);

  useEffect(() => {
    authorizedFetch<{ logs: AuditLogEntry[] }>("/v1/platform/audit-logs").then((response) => setLogs(response.logs));
  }, [authorizedFetch]);

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold text-slate-900">Audit Logları</h1>
      <Card>
        {logs.length === 0 && <p className="text-sm text-slate-500">Henüz kayıtlı bir işlem yok.</p>}
        <ul className="divide-y divide-slate-100">
          {logs.map((log) => (
            <li key={log.id} className="flex items-center justify-between gap-3 py-3 text-sm">
              <div>
                <p className="font-mono text-xs text-slate-500">{log.action}</p>
                <p className="text-slate-700">
                  {log.entityType}
                  {log.entityId && ` #${log.entityId.slice(0, 8)}`}
                </p>
              </div>
              <div className="text-right text-xs text-slate-400">
                <p>{log.actorRole ?? "sistem"}</p>
                <p>{formatDateTime(log.createdAt)}</p>
              </div>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
