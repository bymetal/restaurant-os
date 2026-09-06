import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "Restaurant OS",
  description: "Restoranınızın müşterisini, siparişini ve sadakatini kendi sisteminizde yönetin."
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="tr">
      <body className="bg-white font-sans text-slate-900 antialiased">{children}</body>
    </html>
  );
}
