import { LegalPage } from "../_components/LegalPage";

export default function KvkkPage() {
  return (
    <LegalPage title="KVKK Aydınlatma Metni" updatedAt="7 Eylül 2026">
      <p>
        Bu metin, 6698 sayılı Kişisel Verilerin Korunması Kanunu (&quot;KVKK&quot;) uyarınca, Restaurant OS
        platformunu (&quot;Platform&quot;) işleten veri sorumlusu tarafından, işletme sahibi ve yetkili
        kullanıcılarının kişisel verilerinin işlenmesine ilişkin olarak aydınlatma yükümlülüğünün yerine
        getirilmesi amacıyla hazırlanmıştır.
      </p>

      <h2>1. Veri Sorumlusu</h2>
      <p>
        Platform hesabınıza ilişkin kişisel verileriniz bakımından veri sorumlusu, Restaurant OS&apos;u işleten
        şirkettir. Şirketin güncel ticaret unvanı, adresi ve iletişim bilgileri hesap sözleşmenizde ve fatura
        belgelerinizde yer alır.
      </p>

      <h2>2. İşlenen Kişisel Veriler</h2>
      <ul>
        <li>Kimlik ve iletişim bilgileri: ad soyad, e-posta adresi, telefon numarası.</li>
        <li>Hesap ve işletme bilgileri: işletme adı, şube adresleri, rol ve yetki bilgileri.</li>
        <li>
          İşlem güvenliği verileri: giriş/oturum kayıtları, IP adresi, tarayıcı bilgisi, denetim (audit) kayıtları.
        </li>
        <li>Abonelik ve plan bilgileri (fatura sağlayıcısı entegre edildiğinde ödeme işlemcisi üzerinden).</li>
      </ul>

      <h2>3. Kişisel Verilerin İşlenme Amaçları</h2>
      <ul>
        <li>Platform hesabınızın oluşturulması, kimlik doğrulaması ve yetkilendirme işlemlerinin yürütülmesi.</li>
        <li>Sipariş, sadakat, kampanya ve analitik hizmetlerinin sunulması.</li>
        <li>Hesap güvenliğinin sağlanması, yetkisiz erişimlerin tespiti ve önlenmesi (denetim kayıtları).</li>
        <li>Yasal yükümlülüklerin yerine getirilmesi ve talep/şikayetlerin yönetilmesi.</li>
      </ul>

      <h2>4. Kişisel Verilerin Aktarılması</h2>
      <p>
        Kişisel verileriniz; barındırma (hosting) altyapı sağlayıcımız, işletmenizin tercih ettiği WhatsApp/Telegram
        bildirim sağlayıcıları ve yasal olarak yetkili kamu kurum ve kuruluşları ile, yalnızca hizmetin
        sunulabilmesi için gerekli ölçüde ve KVKK&apos;nın 8. ve 9. maddelerinde öngörülen şartlara uygun olarak
        paylaşılabilir. Verileriniz yurt dışına aktarılmamaktadır.
      </p>

      <h2>5. Kişisel Veri Toplamanın Yöntemi ve Hukuki Sebebi</h2>
      <p>
        Kişisel verileriniz, Platform&apos;a kaydolmanız, formları doldurmanız ve Platform&apos;u kullanmanız
        sırasında elektronik ortamda; bir sözleşmenin kurulması veya ifasıyla doğrudan ilgili olması, hukuki
        yükümlülüğün yerine getirilmesi ve meşru menfaat hukuki sebeplerine dayanarak toplanmaktadır.
      </p>

      <h2>6. Haklarınız (KVKK Madde 11)</h2>
      <p>KVKK&apos;nın 11. maddesi uyarınca aşağıdaki haklara sahipsiniz:</p>
      <ul>
        <li>Kişisel verilerinizin işlenip işlenmediğini öğrenme,</li>
        <li>İşlenmişse buna ilişkin bilgi talep etme,</li>
        <li>İşlenme amacını ve amacına uygun kullanılıp kullanılmadığını öğrenme,</li>
        <li>Yurt içinde/yurt dışında aktarıldığı üçüncü kişileri bilme,</li>
        <li>Eksik/yanlış işlenmişse düzeltilmesini isteme,</li>
        <li>KVKK&apos;nın 7. maddesindeki şartlar çerçevesinde silinmesini/yok edilmesini isteme,</li>
        <li>Yapılan işlemlerin, verilerin aktarıldığı üçüncü kişilere bildirilmesini isteme,</li>
        <li>Otomatik sistemlerle analiz sonucu aleyhinize bir sonucun ortaya çıkmasına itiraz etme,</li>
        <li>Kanuna aykırı işleme sebebiyle zarara uğramanız hâlinde zararın giderilmesini talep etme.</li>
      </ul>

      <h2>7. Başvuru Yöntemi</h2>
      <p>
        Yukarıdaki haklarınızı kullanmak için hesabınızda kayıtlı e-posta adresinizden, işletme hesap yöneticinize
        veya destek kanallarımıza yazılı olarak başvurabilirsiniz. Talepleriniz, KVKK&apos;da öngörülen süre
        içinde ücretsiz olarak sonuçlandırılır.
      </p>

      <h2>8. Restoran Müşterileri (Son Kullanıcılar) Hakkında Önemli Not</h2>
      <p>
        Restaurant OS, işletmenizin QR menü, WhatsApp ve Telegram üzerinden kendi müşterileriyle kurduğu ilişkide
        (sipariş, sadakat puanı, pazarlama izni gibi) yalnızca <strong>veri işleyen</strong> sıfatıyla teknik
        altyapıyı sağlar. Bu kapsamda toplanan son kullanıcı verileri (ad, telefon, sipariş geçmişi, iletişim
        izni) bakımından <strong>veri sorumlusu işletmenizdir</strong>. Platform, işletmenizin KVKK
        yükümlülüklerini yerine getirebilmesi için açık rıza kaydı, itiraz (STOP/İPTAL) ve veri erişim
        mekanizmalarını teknik olarak destekler; son kullanıcıların kendi hakları için doğrudan ilgili işletmeye
        başvurması gerekir.
      </p>
    </LegalPage>
  );
}
