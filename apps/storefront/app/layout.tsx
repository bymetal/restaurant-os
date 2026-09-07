import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import { CookieConsentBanner } from "@restaurant-os/ui";
import "./globals.css";

export const metadata: Metadata = {
  title: "Restaurant OS",
  description: "QR menü ile doğrudan sipariş verin, sadakat puanlarınızı takip edin."
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="tr">
      <body className="bg-white font-sans text-slate-900 antialiased">
        {children}
        <CookieConsentBanner
          policyHref="/gizlilik-ve-cerezler"
          linkComponent={Link}
          wrapperClassName="fixed inset-x-0 bottom-16 z-50 mx-auto max-w-md border-t border-slate-200 bg-white p-3 shadow-[0_-4px_16px_rgba(15,23,42,0.08)]"
          containerClassName="flex flex-col items-start gap-2"
        />
      </body>
    </html>
  );
}
