import Link from "next/link";
import { UtensilsCrossed } from "lucide-react";

const legalLinks = [
  { href: "/gizlilik-politikasi", label: "Gizlilik Politikası" },
  { href: "/kullanim-sartlari", label: "Kullanım Şartları" },
  { href: "/kvkk", label: "KVKK Aydınlatma Metni" },
  { href: "/cerez-politikasi", label: "Çerez Politikası" }
];

export function Footer() {
  return (
    <footer className="border-t border-slate-200 bg-slate-50 px-6 py-10">
      <div className="mx-auto flex max-w-6xl flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
        <span className="flex items-center gap-2 text-sm font-bold text-slate-900">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand-600 text-white">
            <UtensilsCrossed size={14} />
          </span>
          Restaurant OS
        </span>
        <nav className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-slate-600">
          {legalLinks.map((link) => (
            <Link key={link.href} href={link.href} className="hover:text-slate-900">
              {link.label}
            </Link>
          ))}
        </nav>
        <p className="text-xs text-slate-400">© {new Date().getFullYear()} Restaurant OS. Tüm hakları saklıdır.</p>
      </div>
    </footer>
  );
}
