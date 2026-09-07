export default function GizlilikVeCerezlerPage() {
  return (
    <main className="mx-auto max-w-md px-4 py-10 text-sm text-slate-600">
      <h1 className="text-xl font-bold text-slate-900">Gizlilik ve Çerezler</h1>
      <p className="mt-2 text-xs text-slate-400">Son güncelleme: 7 Eylül 2026</p>

      <div className="mt-6 space-y-4 leading-relaxed">
        <p>
          Bu sayfa, QR menü üzerinden sipariş verdiğiniz restoranın Restaurant OS altyapısını nasıl kullandığını
          açıklar.
        </p>

        <h2 className="mt-6 text-base font-bold text-slate-900">Verileriniz Kime Ait?</h2>
        <p>
          Siparişiniz sırasında paylaştığınız ad, telefon numarası, adres ve sipariş içeriği, sipariş verdiğiniz{" "}
          <strong>restoran tarafından</strong> işlenir; restoran bu verilerin veri sorumlusudur. Restaurant OS,
          restoranın bu hizmeti size sunabilmesi için yalnızca teknik altyapıyı (veri işleyen sıfatıyla) sağlar.
        </p>

        <h2 className="mt-6 text-base font-bold text-slate-900">WhatsApp / Telegram İletişimi</h2>
        <p>
          Restorana WhatsApp üzerinden &quot;KATIL&quot; veya &quot;SADAKAT&quot; yazarak katılım sağladığınızda,
          yalnızca sipariş/sadakat bildirimleri (işlemsel mesajlar) almaya rıza vermiş olursunuz. Pazarlama
          mesajları için ayrı bir açık rızanız istenir. İstediğiniz zaman <strong>STOP</strong> veya{" "}
          <strong>İPTAL</strong> yazarak pazarlama mesajlarından çıkabilirsiniz; bu talebiniz kaydedilir ve
          tekrar rızanız olmadan geri alınmaz.
        </p>

        <h2 className="mt-6 text-base font-bold text-slate-900">Çerezler</h2>
        <p>
          Bu sayfa, yalnızca sepetinizi ve sipariş oturumunuzu hatırlamak için tek bir zorunlu çerez
          (<code className="rounded bg-slate-100 px-1 py-0.5 text-xs">restaurant_os_storefront</code>) kullanır.
          Reklam veya takip amaçlı çerez kullanılmaz.
        </p>

        <h2 className="mt-6 text-base font-bold text-slate-900">Haklarınız</h2>
        <p>
          Verilerinizin silinmesi, düzeltilmesi veya iletişim tercihlerinizin değiştirilmesi için doğrudan
          sipariş verdiğiniz restorana başvurabilirsiniz.
        </p>
      </div>
    </main>
  );
}
