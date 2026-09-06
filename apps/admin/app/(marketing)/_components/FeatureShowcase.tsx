import { BarChart3, Gift, ShoppingBag } from "lucide-react";

const popularProducts = [
  { name: "Trüflü Manti", value: 482 },
  { name: "Dana Kaburga", value: 421 },
  { name: "Burrata Salata", value: 379 },
  { name: "Levrek Izgara", value: 312 },
  { name: "Cheesecake", value: 287 }
];
const maxPopular = Math.max(...popularProducts.map((product) => product.value));

export function FeatureShowcase() {
  return (
    <section id="ozellikler" className="mx-auto max-w-6xl px-6 py-16">
      <div className="grid gap-5 md:grid-cols-3">
        <div className="rounded-xl2 border border-slate-200 bg-white p-6">
          <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
            <ShoppingBag size={20} />
          </span>
          <h3 className="mt-3 text-lg font-bold text-slate-900">Doğrudan Sipariş</h3>
          <p className="mt-1 text-sm text-slate-500">
            Kendi markanız altında QR menü ve WhatsApp üzerinden komisyonsuz, doğrudan sipariş alın. Popüler
            platformlara bağlı kalmayın.
          </p>
          <a href="#" className="mt-3 inline-block text-sm font-semibold text-brand-600">
            Daha fazla bilgi →
          </a>
          <div className="mt-5 rounded-xl2 border border-slate-100 bg-slate-50 p-4">
            <p className="text-sm font-semibold text-slate-900">Masa İstanbul</p>
            <p className="text-xs text-slate-500">Modern Türk Mutfağı</p>
            <div className="mt-3 flex gap-2 text-xs">
              <span className="rounded-full bg-brand-600 px-2.5 py-1 font-semibold text-white">Tüm Menü</span>
              <span className="rounded-full bg-white px-2.5 py-1 text-slate-500">Başlangıçlar</span>
              <span className="rounded-full bg-white px-2.5 py-1 text-slate-500">Ana Yemekler</span>
            </div>
            <div className="mt-3 space-y-2">
              <div className="flex items-center justify-between rounded-lg bg-white px-3 py-2 text-sm">
                <span>Trüflü Manti</span>
                <span className="font-semibold text-slate-900">₺320</span>
              </div>
              <div className="flex items-center justify-between rounded-lg bg-white px-3 py-2 text-sm">
                <span>Dana Kaburga</span>
                <span className="font-semibold text-slate-900">₺480</span>
              </div>
            </div>
          </div>
        </div>

        <div className="rounded-xl2 border border-slate-200 bg-white p-6">
          <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
            <Gift size={20} />
          </span>
          <h3 className="mt-3 text-lg font-bold text-slate-900">Sadakat Programı</h3>
          <p className="mt-1 text-sm text-slate-500">
            Misafirlerinizi ödüllendirin, tekrar ziyaretlerini artırın. Size özel sadakat kurallarıyla uzun vadeli
            ilişkiler kurun.
          </p>
          <a href="#" className="mt-3 inline-block text-sm font-semibold text-brand-600">
            Daha fazla bilgi →
          </a>
          <div className="mt-5 rounded-xl2 bg-brand-600 p-4 text-white">
            <p className="text-sm font-semibold">Masa İstanbul</p>
            <p className="text-xs text-brand-100">Sadakat Programı</p>
            <p className="mt-3 text-2xl font-bold">320</p>
            <p className="text-xs text-brand-100">Puanınız var</p>
            <div className="mt-3 flex items-center justify-between rounded-lg bg-white/10 px-3 py-2 text-xs">
              <span>Ücretsiz Tatlı</span>
              <span className="font-semibold">500 puan</span>
            </div>
          </div>
        </div>

        <div className="rounded-xl2 border border-slate-200 bg-white p-6">
          <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
            <BarChart3 size={20} />
          </span>
          <h3 className="mt-3 text-lg font-bold text-slate-900">Gelişmiş Analitik</h3>
          <p className="mt-1 text-sm text-slate-500">
            Gerçek zamanlı verilerle misafirlerinizi daha iyi tanıyın. Hangi yemekler popüler, kimler tekrar geliyor,
            kampanyalar nasıl performans gösteriyor görün.
          </p>
          <a href="#" className="mt-3 inline-block text-sm font-semibold text-brand-600">
            Daha fazla bilgi →
          </a>
          <div className="mt-5 rounded-xl2 border border-slate-100 bg-slate-50 p-4">
            <div className="mb-2 flex items-center justify-between text-xs font-semibold text-slate-500">
              <span>En Popüler Ürünler</span>
              <span>Tümünü Gör</span>
            </div>
            <div className="space-y-2">
              {popularProducts.map((product, index) => (
                <div key={product.name} className="flex items-center gap-2 text-xs">
                  <span className="w-3 text-slate-400">{index + 1}</span>
                  <span className="w-24 truncate text-slate-700">{product.name}</span>
                  <div className="h-1.5 flex-1 rounded-full bg-slate-200">
                    <div
                      className="h-1.5 rounded-full bg-brand-500"
                      style={{ width: `${(product.value / maxPopular) * 100}%` }}
                    />
                  </div>
                  <span className="w-8 text-right font-medium text-slate-500">{product.value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
