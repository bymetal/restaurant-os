import type { ReactNode } from "react";
import clsx from "clsx";

export interface TimelineEntry {
  id: string;
  icon?: ReactNode;
  title: string;
  timestamp: string;
  tone?: "neutral" | "brand" | "success";
}

export interface TimelineFeedProps {
  entries: TimelineEntry[];
  emptyLabel?: string;
}

const toneClasses: Record<NonNullable<TimelineEntry["tone"]>, string> = {
  neutral: "bg-slate-100 text-slate-500",
  brand: "bg-brand-100 text-brand-600",
  success: "bg-emerald-100 text-emerald-600"
};

export function TimelineFeed({ entries, emptyLabel = "Henüz bir etkileşim yok." }: TimelineFeedProps) {
  if (entries.length === 0) {
    return <p className="text-sm text-slate-500">{emptyLabel}</p>;
  }
  return (
    <ul className="space-y-4">
      {entries.map((entry) => (
        <li key={entry.id} className="flex items-start gap-3">
          <span
            className={clsx(
              "flex h-8 w-8 shrink-0 items-center justify-center rounded-full",
              toneClasses[entry.tone ?? "neutral"]
            )}
          >
            {entry.icon}
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-slate-900">{entry.title}</p>
            <p className="text-xs text-slate-400">{entry.timestamp}</p>
          </div>
        </li>
      ))}
    </ul>
  );
}
