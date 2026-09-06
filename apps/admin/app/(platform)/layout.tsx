import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { AuthProvider } from "../../lib/auth-context";
import { getServerSession } from "../../lib/server-session";
import { PlatformShell } from "./platform-shell";

export default async function PlatformLayout({ children }: { children: ReactNode }) {
  const session = await getServerSession();
  if (!session || session.user.scope !== "platform") redirect("/login");

  return (
    <AuthProvider initialUser={session.user} initialAccessToken={session.accessToken}>
      <PlatformShell>{children}</PlatformShell>
    </AuthProvider>
  );
}
