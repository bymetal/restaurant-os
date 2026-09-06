export const consentTypes = ["TRANSACTIONAL", "MARKETING", "LOYALTY"] as const;
export type ConsentType = (typeof consentTypes)[number];

export const consentStatuses = ["granted", "withdrawn"] as const;
export type ConsentStatus = (typeof consentStatuses)[number];

const optOutKeywords = ["STOP", "IPTAL", "İPTAL", "MESAJ ISTEMIYORUM", "MESAJ İSTEMİYORUM"];

export function isOptOutMessage(text: string): boolean {
  const normalized = text.trim().toLocaleUpperCase("tr-TR");
  return optOutKeywords.some((keyword) => normalized === keyword.toLocaleUpperCase("tr-TR"));
}

export interface ParsedInboundCommand {
  command: "JOIN" | "LOYALTY_CLAIM";
  token: string;
}

export function parseInboundCommand(text: string): ParsedInboundCommand | null {
  const trimmed = text.trim();
  const joinMatch = /^KATIL\s+(\S+)$/i.exec(trimmed);
  if (joinMatch?.[1]) return { command: "JOIN", token: joinMatch[1] };
  const claimMatch = /^SADAKAT\s+(\S+)$/i.exec(trimmed);
  if (claimMatch?.[1]) return { command: "LOYALTY_CLAIM", token: claimMatch[1] };
  return null;
}
