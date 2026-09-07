export type PrintDeviceRole = "KITCHEN" | "CASHIER";
export type PrintDeviceStatus = "online" | "offline";

export interface PrintDevice {
  id: string;
  businessId: string;
  branchId: string;
  name: string;
  role: PrintDeviceRole;
  status: PrintDeviceStatus;
  lastHeartbeatAt: string | null;
  createdAt: string;
}

export interface Branch {
  id: string;
  name: string;
}
