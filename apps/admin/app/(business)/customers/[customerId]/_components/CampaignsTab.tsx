import { Megaphone } from "lucide-react";
import { Card, EmptyState } from "@restaurant-os/ui";

export function CampaignsTab() {
  return (
    <Card title="Kampanyalar">
      <EmptyState
        icon={<Megaphone size={28} />}
        title="Kampanya entegrasyonu yakında"
        description="Bu müşteriye gönderilen kampanyalar ve etkileşimleri, kampanya motoru tamamlandığında burada görünecek."
      />
    </Card>
  );
}
