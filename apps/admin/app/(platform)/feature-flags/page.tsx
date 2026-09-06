import { Flag } from "lucide-react";
import { ComingSoon } from "../_components/ComingSoon";

export default function FeatureFlagsPage() {
  return (
    <ComingSoon
      title="Feature Flags"
      icon={<Flag size={28} />}
      description="Kademeli özellik dağıtımı ve deney yönetimi yakında burada olacak."
    />
  );
}
