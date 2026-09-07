import Link from "next/link";
import { LegalPage } from "../_components/LegalPage";

export default function GizlilikPolitikasiPage() {
  return (
    <LegalPage title="Gizlilik Politikası" updatedAt="7 Eylül 2026">
      <p>
        Bu Gizlilik Politikası, Restaurant OS Platformu&apos;nu (&quot;Platform&quot;) kullanan işletme sahipleri
        ve yetkili kullanıcıların verilerinin nasıl toplandığını, kullanıldığını ve korunduğunu açıklar. Kişisel
        verilerin işlenmesine ilişkin yasal dayanaklar için ayrıca{" "}
        <Link href="/kvkk" className="font-semibold text-brand-600 hover:underline">
          KVKK Aydınlatma Metni&apos;ni
        </Link>{" "}
        inceleyebilirsiniz.
      </p>

      <h2>1. Topladığımız Veriler</h2>
      <ul>
        <li>Hesap oluştururken verdiğiniz ad, e-posta, telefon ve işletme bilgileri.</li>
        <li>Platform&apos;u kullanırken oluşan işlem verileri: siparişler, sadakat hareketleri, kampanya kayıtları.</li>
        <li>Güvenlik amacıyla tutulan giriş/çıkış ve denetim (audit) kayıtları.</li>
        <li>Yalnızca zorunlu oturum çerezleri — ayrıntı için Çerez Politikası&apos;na bakınız.</li>
      </ul>

      <h2>2. Verileri Nasıl Kullanıyoruz</h2>
      <p>
        Verileriniz yalnızca hesabınızın çalışması, sipariş/sadakat/kampanya/analitik özelliklerinin sunulması,
        hesap güvenliğinin sağlanması ve yasal yükümlülüklerin yerine getirilmesi amacıyla kullanılır. Verileriniz
        reklam amacıyla üçüncü taraflara satılmaz veya kiralanmaz.
      </p>

      <h2>3. Üçüncü Taraf Hizmet Sağlayıcılar</h2>
      <p>
        İşletmenizin tercihine bağlı olarak, sipariş bildirimlerinin iletilmesi için WhatsApp (Evolution API
        altyapısı üzerinden) ve/veya Telegram entegrasyonları kullanılabilir; bu entegrasyonlar yalnızca
        işletmenizin bağladığı hesap/sohbet ile sınırlıdır. Ödeme işlemleri şu an için platform dışında,
        işletmenizin kendi tahsilat yöntemleriyle (kapıda ödeme vb.) gerçekleştirilir; Platform bir ödeme
        sağlayıcısı barındırmaz.
      </p>

      <h2>4. Veri Güvenliği</h2>
      <p>
        Şifreleriniz geri döndürülemez biçimde hash&apos;lenerek saklanır. Entegrasyon erişim anahtarları
        (örn. WhatsApp bağlantı bilgileri) AES-256-GCM ile şifrelenerek veritabanında tutulur. Her işletmenin
        verisi, sunucu tarafında zorunlu kiracı (tenant) izolasyonu ile diğer işletmelerden ayrıştırılır; hassas
        işlemler (rol değişikliği, veri dışa aktarımı, sadakat düzeltmeleri) denetim kaydına yazılır.
      </p>

      <h2>5. Veri Saklama Süresi</h2>
      <p>
        Verileriniz, hesabınız aktif olduğu sürece ve yasal saklama yükümlülüklerinin gerektirdiği süre boyunca
        saklanır. Hesap kapatma talebiniz üzerine, yasal saklama zorunlulukları hariç olmak üzere verileriniz
        silinir veya anonimleştirilir.
      </p>

      <h2>6. İletişim</h2>
      <p>
        Bu politika hakkında sorularınız için hesabınızda kayıtlı destek kanallarımızdan bize ulaşabilirsiniz.
      </p>
    </LegalPage>
  );
}
