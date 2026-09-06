import type { ReactNode } from "react";

export interface TopBarProps {
  left?: ReactNode;
  right?: ReactNode;
}

export function TopBar({ left, right }: TopBarProps) {
  return (
    <header className="flex h-16 shrink-0 items-center justify-between border-b border-slate-200 bg-white px-6">
      <div className="flex items-center gap-4">{left}</div>
      <div className="flex items-center gap-4">{right}</div>
    </header>
  );
}
