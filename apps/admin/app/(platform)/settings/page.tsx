import { Settings } from "lucide-react";
import { ComingSoon } from "../_components/ComingSoon";

export default function PlatformSettingsPage() {
  return (
    <ComingSoon
      title="Ayarlar"
      icon={<Settings size={28} />}
      description="Platform genelinde yapılandırma seçenekleri yakında burada olacak."
    />
  );
}
