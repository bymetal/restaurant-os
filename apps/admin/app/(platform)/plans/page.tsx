import { FileText } from "lucide-react";
import { ComingSoon } from "../_components/ComingSoon";

export default function PlansPage() {
  return (
    <ComingSoon
      title="Planlar"
      icon={<FileText size={28} />}
      description="Plan oluşturma ve fiyatlandırma yönetimi yakında burada olacak. Şu an Starter/Growth/Pro planları Abonelikler sayfasından atanabilir."
    />
  );
}
