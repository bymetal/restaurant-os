"use client";

import { useEffect, useState } from "react";
import { Button, Card } from "@restaurant-os/ui";
import { useAuth } from "../../../../../lib/auth-context";
import { formatDateTime } from "../../../../../lib/format";
import type { CustomerNote } from "../../../../../lib/customer-types";

export function NotesTab({ customerId }: { customerId: string }) {
  const { authorizedFetch } = useAuth();
  const [notes, setNotes] = useState<CustomerNote[]>([]);
  const [draft, setDraft] = useState("");
  const [submitting, setSubmitting] = useState(false);

  function loadNotes() {
    authorizedFetch<{ notes: CustomerNote[] }>(`/v1/customers/${customerId}/notes`).then((response) =>
      setNotes(response.notes)
    );
  }

  useEffect(loadNotes, [customerId, authorizedFetch]);

  async function handleSubmit() {
    if (!draft.trim()) return;
    setSubmitting(true);
    try {
      await authorizedFetch(`/v1/customers/${customerId}/notes`, { method: "POST", body: { body: draft.trim() } });
      setDraft("");
      loadNotes();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Card title="Notlar">
      <div className="mb-4 flex items-start gap-2">
        <textarea
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="Bu müşteri hakkında bir not ekleyin..."
          rows={2}
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-500"
        />
        <Button size="sm" onClick={() => void handleSubmit()} disabled={submitting || !draft.trim()}>
          Ekle
        </Button>
      </div>
      {notes.length === 0 && <p className="text-sm text-slate-500">Henüz not eklenmemiş.</p>}
      <ul className="space-y-3">
        {notes.map((note) => (
          <li key={note.id} className="rounded-lg bg-slate-50 p-3 text-sm">
            <p className="text-slate-700">{note.body}</p>
            <p className="mt-1 text-xs text-slate-400">{formatDateTime(note.createdAt)}</p>
          </li>
        ))}
      </ul>
    </Card>
  );
}
