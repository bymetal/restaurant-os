"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Activity,
  Bell,
  Building2,
  CreditCard,
  FileText,
  Flag,
  LayoutDashboard,
  LifeBuoy,
  Plug,
  Settings,
  TrendingUp,
  Users
} from "lucide-react";
import { Avatar, Sidebar, TopBar, type SidebarItem } from "@restaurant-os/ui";
import { useAuth } from "../../lib/auth-context";

const navItems: SidebarItem[] = [
  { href: "/overview", label: "Genel Bakış", icon: <LayoutDashboard size={16} /> },
  { href: "/businesses", label: "Restoranlar", icon: <Building2 size={16} /> },
  { href: "/leads", label: "Leadler", icon: <TrendingUp size={16} /> },
  { href: "/subscriptions", label: "Abonelikler", icon: <CreditCard size={16} /> },
  { href: "/platform-customers", label: "Müşteriler", icon: <Users size={16} /> },
  { href: "/revenue", label: "Gelir", icon: <TrendingUp size={16} /> },
  { href: "/integrations", label: "Entegrasyonlar", icon: <Plug size={16} /> },
  { href: "/system-health", label: "Sistem Sağlığı", icon: <Activity size={16} /> },
  { href: "/plans", label: "Planlar", icon: <FileText size={16} /> },
  { href: "/feature-flags", label: "Feature Flags", icon: <Flag size={16} /> },
  { href: "/support", label: "Destek", icon: <LifeBuoy size={16} /> },
  { href: "/audit-logs", label: "Audit Logları", icon: <FileText size={16} /> },
  { href: "/settings", label: "Ayarlar", icon: <Settings size={16} /> }
];

export function PlatformShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { user, logout } = useAuth();

  return (
    <div className="flex h-screen">
      <Sidebar
        brand={
          <div>
            <span className="flex items-center gap-2 text-base font-bold text-slate-900">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-600 text-white">🍴</span>
              Restaurant OS
            </span>
            <p className="ml-10 text-xs text-slate-400">Super Admin</p>
          </div>
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
                <p className="truncate text-xs text-slate-500">Super Admin</p>
              </div>
              <button type="button" onClick={() => void logout()} className="text-xs text-slate-400 hover:text-red-600">
                Çıkış
              </button>
            </div>
          )
        }
      />
      <div className="flex flex-1 flex-col overflow-hidden">
        <TopBar
          left={<span className="text-sm font-semibold text-slate-700">Restaurant OS – Platform Yönetimi</span>}
          right={<Bell size={18} className="text-slate-400" />}
        />
        <main className="flex-1 overflow-y-auto bg-slate-50 p-6">{children}</main>
      </div>
    </div>
  );
}
