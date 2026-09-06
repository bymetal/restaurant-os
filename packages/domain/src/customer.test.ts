import { describe, expect, it } from "vitest";
import { InvalidPhoneError, normalizePhone } from "./customer.js";

describe("normalizePhone", () => {
  it("strips formatting characters", () => {
    expect(normalizePhone("+90 532 123 45 67")).toBe("905321234567");
  });

  it("strips a leading 00 international prefix", () => {
    expect(normalizePhone("0090 532 123 45 67")).toBe("905321234567");
  });

  it("rejects numbers that are too short", () => {
    expect(() => normalizePhone("123")).toThrow(InvalidPhoneError);
  });

  it("rejects numbers that are too long", () => {
    expect(() => normalizePhone("1".repeat(21))).toThrow(InvalidPhoneError);
  });
});
