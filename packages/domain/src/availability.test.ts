import { describe, expect, it } from "vitest";
import { isProductAvailable } from "./availability.js";

describe("product availability", () => {
  it("treats a missing branch override as available", () => {
    expect(isProductAvailable(null, new Date("2026-09-06T12:00:00.000Z"), "Europe/Istanbul")).toBe(true);
  });

  it("respects a branch stock override and date window", () => {
    const now = new Date("2026-09-06T12:00:00.000Z");

    expect(isProductAvailable({ available: false }, now, "Europe/Istanbul")).toBe(false);
    expect(
      isProductAvailable(
        { available: true, availableFrom: new Date("2026-09-07T00:00:00.000Z") },
        now,
        "Europe/Istanbul"
      )
    ).toBe(false);
  });

  it("evaluates weekly windows in the branch timezone", () => {
    const availability = {
      available: true,
      schedule: { sunday: [{ start: "14:00", end: "18:00" }] }
    };

    expect(isProductAvailable(availability, new Date("2026-09-06T11:00:00.000Z"), "Europe/Istanbul")).toBe(true);
    expect(isProductAvailable(availability, new Date("2026-09-06T15:00:00.000Z"), "Europe/Istanbul")).toBe(false);
  });
});
