import type { ReactNode } from "react";
import { Footer } from "./Footer";
import { MarketingNav } from "./MarketingNav";

export function LegalPage({ title, updatedAt, children }: { title: string; updatedAt: string; children: ReactNode }) {
  return (
    <>
      <MarketingNav />
      <main className="mx-auto max-w-3xl px-6 py-16">
        <h1 className="text-3xl font-bold text-slate-900">{title}</h1>
        <p className="mt-2 text-sm text-slate-500">Son güncelleme: {updatedAt}</p>
        <div className="legal-content mt-8">{children}</div>
      </main>
      <Footer />
    </>
  );
}
