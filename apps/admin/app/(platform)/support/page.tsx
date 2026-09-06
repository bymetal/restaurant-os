import { LifeBuoy } from "lucide-react";
import { ComingSoon } from "../_components/ComingSoon";

export default function SupportPage() {
  return (
    <ComingSoon
      title="Destek"
      icon={<LifeBuoy size={28} />}
      description="Restoran sahiplerinden gelen destek talepleri yakında burada yönetilecek."
    />
  );
}
