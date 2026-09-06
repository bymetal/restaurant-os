import { Users } from "lucide-react";
import { ComingSoon } from "../_components/ComingSoon";

export default function PlatformCustomersPage() {
  return (
    <ComingSoon
      title="Müşteriler"
      icon={<Users size={28} />}
      description="Platform genelinde müşteri arama ve segmentasyon yakında burada olacak."
    />
  );
}
