import { Check } from "lucide-react";
import clsx from "clsx";
import { Button } from "@restaurant-os/ui";

const plans = [
  {
    code: "starter",
    name: "Starter",
    description: "Küçük işletmeler için ideal",
    price: "₺1.490",
    featured: false,
    features: ["QR menü", "WhatsApp entegrasyonu", "Temel analitik"]
  },
  {
    code: "growth",
    name: "Growth",
    description: "Büyüyen restoranlar için",
    price: "₺2.990",
    featured: true,
    features: ["Tüm Starter özellikleri", "Sadakat programı", "Gelişmiş analitik"]
  },
  {
    code: "pro",
    name: "Pro",
    description: "Birden fazla şube için",
    price: "₺5.990",
    featured: false,
    features: ["Tüm Growth özellikleri", "Çok şubeli yönetim", "Özel entegrasyonlar"]
  }
];

export function Pricing() {
  return (
    <section id="fiyatlar" className="mx-auto max-w-6xl px-6 py-16">
      <div className="grid gap-10 md:grid-cols-[1fr_2fr] md:items-start">
        <div>
          <p className="text-sm font-bold uppercase tracking-wide text-brand-600">Restoranınıza uygun plan</p>
          <h2 className="mt-2 text-2xl font-bold text-slate-900 md:text-3xl">Basit, şeffaf fiyatlandırma</h2>
          <p className="mt-3 text-slate-600">
            İhtiyacınıza uygun planı seçin, hemen başlayın. Tüm planlar komisyonsuzdur.
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          {plans.map((plan) => (
            <div
              key={plan.code}
              className={clsx(
                "relative flex flex-col rounded-xl2 border p-5",
                plan.featured ? "border-brand-600 shadow-lg" : "border-slate-200"
              )}
            >
              {plan.featured && (
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-brand-600 px-3 py-1 text-xs font-semibold text-white">
                  En Popüler
                </span>
              )}
              <p className="font-bold text-slate-900">{plan.name}</p>
              <p className="mt-1 text-xs text-slate-500">{plan.description}</p>
              <p className="mt-4 text-2xl font-extrabold text-slate-900">
                {plan.price} <span className="text-sm font-medium text-slate-400">/ ay</span>
              </p>
              <ul className="mt-4 flex-1 space-y-2 text-sm text-slate-600">
                {plan.features.map((feature) => (
                  <li key={feature} className="flex items-center gap-2">
                    <Check size={16} className="shrink-0 text-emerald-600" />
                    {feature}
                  </li>
                ))}
              </ul>
              <Button variant={plan.featured ? "primary" : "outline"} className="mt-5 w-full">
                Demo İste
              </Button>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
