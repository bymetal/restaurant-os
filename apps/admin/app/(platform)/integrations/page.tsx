import { Plug } from "lucide-react";
import { ComingSoon } from "../_components/ComingSoon";

export default function IntegrationsPage() {
  return (
    <ComingSoon
      title="Entegrasyonlar"
      icon={<Plug size={28} />}
      description="WhatsApp (Evolution API), yazıcı ajanı ve n8n otomasyon entegrasyonları yakında burada yönetilecek."
    />
  );
}
