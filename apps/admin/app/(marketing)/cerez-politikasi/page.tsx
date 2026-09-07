import { LegalPage } from "../_components/LegalPage";

export default function CerezPolitikasiPage() {
  return (
    <LegalPage title="Çerez Politikası" updatedAt="7 Eylül 2026">
      <p>
        Restaurant OS Platformu, yalnızca hizmetin çalışabilmesi için zorunlu olan çerezleri kullanır. Reklam,
        analiz veya üçüncü taraf takip amaçlı çerez kullanılmamaktadır.
      </p>

      <h2>Kullandığımız Çerezler</h2>
      <ul>
        <li>
          <strong>restaurant_os_refresh</strong> — Yönetim panelinde oturumunuzu güvenli şekilde açık tutmak için
          kullanılan, yalnızca sunucu tarafından okunabilen (HttpOnly) bir oturum yenileme çerezidir. Tarayıcı
          JavaScript&apos;i bu çereze erişemez.
        </li>
        <li>
          <strong>restaurant_os_storefront</strong> — QR menü üzerinden sepetinizi ve sipariş oturumunuzu
          hatırlamak için kullanılan, oturum süresince geçerli bir çerezdir.
        </li>
      </ul>

      <h2>Bu Çerezleri Neden Kullanıyoruz</h2>
      <p>
        Bu çerezler, oturum açma ve sepet/sipariş akışı gibi temel işlevler için zorunludur; devre dışı
        bırakılmaları hâlinde Platform&apos;un ilgili bölümleri çalışmaz. Bu nedenle bu çerezler için ayrı bir
        açma/kapama tercihi sunulmamaktadır.
      </p>

      <h2>Çerezleri Nasıl Yönetebilirsiniz</h2>
      <p>
        Tarayıcınızın ayarlarından mevcut çerezleri silebilir veya yeni çerez kaydını engelleyebilirsiniz; ancak
        bu durumda oturum açma ve sepet özellikleri düzgün çalışmayabilir.
      </p>
    </LegalPage>
  );
}
