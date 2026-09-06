import type { ElementType, ReactNode } from "react";
import clsx from "clsx";

export interface SidebarItem {
  href: string;
  label: string;
  icon?: ReactNode;
  badge?: number;
}

export interface SidebarProps {
  brand: ReactNode;
  items: SidebarItem[];
  activeHref: string;
  footer?: ReactNode;
  linkComponent?: ElementType;
}

export function Sidebar({ brand, items, activeHref, footer, linkComponent }: SidebarProps) {
  const Link = linkComponent ?? "a";
  return (
    <aside className="flex h-full w-64 shrink-0 flex-col border-r border-slate-200 bg-white">
      <div className="flex items-center gap-2 px-5 py-5">{brand}</div>
      <nav className="flex-1 space-y-0.5 overflow-y-auto px-3">
        {items.map((item) => {
          const active = activeHref === item.href || activeHref.startsWith(`${item.href}/`);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={clsx(
                "flex items-center justify-between rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                active ? "bg-brand-50 text-brand-700" : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
              )}
            >
              <span className="flex items-center gap-2.5">
                {item.icon}
                {item.label}
              </span>
              {item.badge !== undefined && item.badge > 0 && (
                <span className="rounded-full bg-brand-600 px-1.5 py-0.5 text-xs font-semibold text-white">
                  {item.badge}
                </span>
              )}
            </Link>
          );
        })}
      </nav>
      {footer && <div className="border-t border-slate-200 p-4">{footer}</div>}
    </aside>
  );
}
