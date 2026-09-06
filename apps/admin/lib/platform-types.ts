export interface PlatformOverview {
  totalBusinesses: number;
  totalBusinessesTrendPct: number;
  activeBusinesses: number;
  todayOrders: number;
  todayOrdersTrendPct: number;
  todayGmvMinor: number;
  todayGmvTrendPct: number;
  totalCustomers: number;
  totalCustomersTrendPct: number;
  mrrMinor: number;
  connectedWhatsapp: number;
  openIssues: number;
  openIssuesTrendPct: number;
}

export interface GmvPoint {
  date: string;
  gmvMinor: number;
  orderCount: number;
  customerCount: number;
}

export interface SystemIssue {
  id: string;
  issueType: string;
  severity: string;
  description: string;
  businessId: string | null;
  occurredAt: string;
}

export interface BusinessRow {
  id: string;
  name: string;
  slug: string;
  active: boolean;
  createdAt: string;
  branchCount: number;
  userCount: number;
  planCode: string | null;
  planName: string | null;
  orders30d: number;
  gmv30dMinor: number;
  lastActivityAt: string | null;
  whatsappStatus: string;
}

export interface AuditLogEntry {
  id: string;
  businessId: string | null;
  action: string;
  entityType: string;
  entityId: string | null;
  actorRole: string | null;
  createdAt: string;
}
