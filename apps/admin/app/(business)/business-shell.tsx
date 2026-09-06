"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Megaphone, MessageCircle, ShoppingCart, Users } from "lucide-react";
import { Avatar, Sidebar, TopBar, type SidebarItem } from "@restaurant-os/ui";
import { useAuth } from "../../lib/auth-context";

const navItems: SidebarItem[] = [
  { href: "/dashboard", label: "Genel Bakış", icon: <LayoutDashboard size={16} /> },
  { href: "/orders", label: "Siparişler", icon: <ShoppingCart size={16} /> },
  { href: "/customers", label: "Müşteriler", icon: <Users size={16} /> },
  { href: "/campaigns", label: "Kampanyalar", icon: <Megaphone size={16} /> },
  { href: "/whatsapp", label: "WhatsApp", icon: <MessageCircle size={16} /> }
];

const roleLabels: Record<string, string> = {
  OWNER: "Restoran Sahibi",
  MANAGER: "Yönetici",
  CASHIER: "Kasiyer",
  KITCHEN: "Mutfak",
  MARKETING: "Pazarlama",
  ANALYST: "Analist"
};

export function BusinessShell({ businessName, children }: { businessName: string; children: ReactNode }) {
  const pathname = usePathname();
  const { user, logout } = useAuth();

  return (
    <div className="flex h-screen">
      <Sidebar
        brand={
          <span className="flex items-center gap-2 text-base font-bold text-slate-900">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-600 text-white">🍴</span>
            Restaurant OS
          </span>
        }
        items={navItems}
        activeHref={pathname}
        linkComponent={Link}
        footer={
          user && (
            <div className="flex items-center gap-2">
              <Avatar name={user.displayName} size={32} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-slate-900">{user.displayName}</p>
                <p className="truncate text-xs text-slate-500">{roleLabels[user.role] ?? user.role}</p>
              </div>
              <button type="button" onClick={() => void logout()} className="text-xs text-slate-400 hover:text-red-600">
                Çıkış
              </button>
            </div>
          )
        }
      />
      <div className="flex flex-1 flex-col overflow-hidden">
        <TopBar left={<span className="text-sm font-semibold text-slate-700">{businessName}</span>} />
        <main className="flex-1 overflow-y-auto bg-slate-50 p-6">{children}</main>
      </div>
    </div>
  );
}
