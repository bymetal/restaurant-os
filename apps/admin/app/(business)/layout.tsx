import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { apiFetch } from "../../lib/api-client";
import { AuthProvider } from "../../lib/auth-context";
import { getServerSession } from "../../lib/server-session";
import { BusinessShell } from "./business-shell";

interface BusinessDetail {
  name: string;
}

export default async function BusinessLayout({ children }: { children: ReactNode }) {
  const session = await getServerSession();
  if (!session || session.user.scope !== "business") redirect("/login");

  const business = await apiFetch<BusinessDetail>("/v1/me/business", { accessToken: session.accessToken }).catch(
    () => null
  );

  return (
    <AuthProvider initialUser={session.user} initialAccessToken={session.accessToken}>
      <BusinessShell businessName={business?.name ?? session.user.displayName}>{children}</BusinessShell>
    </AuthProvider>
  );
}
