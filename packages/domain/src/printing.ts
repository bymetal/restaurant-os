export const printJobTypes = ["KITCHEN_RECEIPT", "CASHIER_RECEIPT", "PIZZA_BOX_LABEL", "DELIVERY_LABEL"] as const;
export type PrintJobType = (typeof printJobTypes)[number];

export const printJobStatuses = ["PENDING", "SENT", "PRINTED", "FAILED", "CANCELLED"] as const;
export type PrintJobStatus = (typeof printJobStatuses)[number];

export const printDeviceRoles = ["KITCHEN", "CASHIER"] as const;
export type PrintDeviceRole = (typeof printDeviceRoles)[number];

const printJobTransitions: Record<PrintJobStatus, readonly PrintJobStatus[]> = {
  PENDING: ["SENT", "CANCELLED"],
  SENT: ["PRINTED", "FAILED", "CANCELLED"],
  PRINTED: [],
  FAILED: ["PENDING", "CANCELLED"],
  CANCELLED: []
};

export function canTransitionPrintJob(from: PrintJobStatus, to: PrintJobStatus): boolean {
  return printJobTransitions[from].includes(to);
}

export function printJobTypeForDeviceRole(role: PrintDeviceRole): PrintJobType {
  return role === "KITCHEN" ? "KITCHEN_RECEIPT" : "CASHIER_RECEIPT";
}
