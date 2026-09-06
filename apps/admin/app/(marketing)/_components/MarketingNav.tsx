import Link from "next/link";
import { UtensilsCrossed } from "lucide-react";
import { Button } from "@restaurant-os/ui";

const navLinks = [
  { href: "#urun", label: "Ürün" },
  { href: "#ozellikler", label: "Özellikler" },
  { href: "#nasil-calisir", label: "Nasıl Çalışır" },
  { href: "#fiyatlar", label: "Fiyatlar" }
];

export function MarketingNav() {
  return (
    <header className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-200 bg-white/90 px-6 py-4 backdrop-blur">
      <span className="flex items-center gap-2 text-lg font-bold text-slate-900">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-600 text-white">
          <UtensilsCrossed size={18} />
        </span>
        Restaurant OS
      </span>
      <nav className="hidden items-center gap-8 text-sm font-medium text-slate-600 md:flex">
        {navLinks.map((link) => (
          <a key={link.href} href={link.href} className="hover:text-slate-900">
            {link.label}
          </a>
        ))}
      </nav>
      <div className="flex items-center gap-3">
        <Link href="/login" className="text-sm font-semibold text-slate-700 hover:text-slate-900">
          Giriş
        </Link>
        <Button size="sm">Demo İste</Button>
      </div>
    </header>
  );
}
