import "server-only";
import { cookies } from "next/headers";
import { refreshSession, type AuthResponse } from "./api-client";

export async function getServerSession(): Promise<AuthResponse | null> {
  const cookieStore = await cookies();
  const cookieHeader = cookieStore
    .getAll()
    .map((entry) => `${entry.name}=${entry.value}`)
    .join("; ");
  if (!cookieHeader) return null;
  return refreshSession(cookieHeader);
}
