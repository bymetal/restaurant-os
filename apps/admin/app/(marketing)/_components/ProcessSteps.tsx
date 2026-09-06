import { ArrowRight, MessageCircle, QrCode, ShoppingCart, Users } from "lucide-react";

const steps = [
  { icon: QrCode, title: "1. QR okut", description: "Masadaki QR kodu misafirleriniz telefonlarıyla okutur." },
  { icon: MessageCircle, title: "2. WhatsApp ile katıl", description: "Misafiriniz tek tıkla WhatsApp üzerinden size bağlanır." },
  { icon: ShoppingCart, title: "3. Sipariş + Sadakat", description: "Kolayca sipariş verir, sadakat programınıza dahil olur." },
  { icon: Users, title: "4. CRM + Tekrar Sipariş", description: "Misafir verileri CRM'de birikir, tekrar siparişler artar." }
];

export function ProcessSteps() {
  return (
    <section id="nasil-calisir" className="bg-slate-50 py-16">
      <div className="mx-auto max-w-6xl px-6">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-slate-900 md:text-3xl">Sadece 4 adımda başlayın</h2>
          <p className="mt-2 text-slate-600">Restoranınız için modern, doğrudan ve sürdürülebilir bir misafir deneyimi</p>
        </div>
        <div className="mt-10 grid gap-4 md:grid-cols-4">
          {steps.map((step, index) => (
            <div key={step.title} className="flex items-center gap-4">
              <div className="flex-1 rounded-xl2 border border-slate-200 bg-white p-5">
                <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
                  <step.icon size={20} />
                </span>
                <p className="mt-3 font-semibold text-slate-900">{step.title}</p>
                <p className="mt-1 text-sm text-slate-500">{step.description}</p>
              </div>
              {index < steps.length - 1 && (
                <ArrowRight size={20} className="hidden shrink-0 text-slate-300 md:block" />
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
