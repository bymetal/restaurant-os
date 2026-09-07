import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import { CookieConsentBanner } from "@restaurant-os/ui";
import "./globals.css";

export const metadata: Metadata = {
  title: "Restaurant OS",
  description: "Restoranınızın müşterisini, siparişini ve sadakatini kendi sisteminizde yönetin."
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="tr">
      <body className="bg-white font-sans text-slate-900 antialiased">
        {children}
        <CookieConsentBanner policyHref="/cerez-politikasi" linkComponent={Link} />
      </body>
    </html>
  );
}
