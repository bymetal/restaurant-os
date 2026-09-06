import { TrendingUp } from "lucide-react";
import { ComingSoon } from "../_components/ComingSoon";

export default function RevenuePage() {
  return (
    <ComingSoon
      title="Gelir"
      icon={<TrendingUp size={28} />}
      description="Detaylı fatura ve tahsilat raporlaması, bir ödeme sağlayıcısı entegre edildiğinde burada olacak."
    />
  );
}
