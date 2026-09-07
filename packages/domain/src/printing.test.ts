import { describe, expect, it } from "vitest";
import { canTransitionPrintJob, printJobTypeForDeviceRole } from "./printing.js";

describe("canTransitionPrintJob", () => {
  it("allows the normal lifecycle", () => {
    expect(canTransitionPrintJob("PENDING", "SENT")).toBe(true);
    expect(canTransitionPrintJob("SENT", "PRINTED")).toBe(true);
    expect(canTransitionPrintJob("SENT", "FAILED")).toBe(true);
    expect(canTransitionPrintJob("FAILED", "PENDING")).toBe(true);
  });

  it("rejects transitions out of terminal states", () => {
    expect(canTransitionPrintJob("PRINTED", "PENDING")).toBe(false);
    expect(canTransitionPrintJob("CANCELLED", "PENDING")).toBe(false);
  });
});

describe("printJobTypeForDeviceRole", () => {
  it("maps device role to the matching receipt type", () => {
    expect(printJobTypeForDeviceRole("KITCHEN")).toBe("KITCHEN_RECEIPT");
    expect(printJobTypeForDeviceRole("CASHIER")).toBe("CASHIER_RECEIPT");
  });
});
