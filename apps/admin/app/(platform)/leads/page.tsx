import { TrendingUp } from "lucide-react";
import { ComingSoon } from "../_components/ComingSoon";

export default function LeadsPage() {
  return (
    <ComingSoon
      title="Leadler"
      icon={<TrendingUp size={28} />}
      description="Potansiyel restoran müşterilerini takip eden lead yönetimi yakında burada olacak."
    />
  );
}
