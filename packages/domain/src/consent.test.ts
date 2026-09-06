import { describe, expect, it } from "vitest";
import { isOptOutMessage, parseInboundCommand } from "./consent.js";

describe("isOptOutMessage", () => {
  it("matches known opt-out keywords case-insensitively", () => {
    expect(isOptOutMessage("stop")).toBe(true);
    expect(isOptOutMessage("IPTAL")).toBe(true);
    expect(isOptOutMessage("mesaj istemiyorum")).toBe(true);
  });

  it("does not match unrelated text", () => {
    expect(isOptOutMessage("merhaba")).toBe(false);
    expect(isOptOutMessage("KATIL abc123")).toBe(false);
  });
});

describe("parseInboundCommand", () => {
  it("parses a JOIN command", () => {
    expect(parseInboundCommand("KATIL abc123")).toEqual({ command: "JOIN", token: "abc123" });
    expect(parseInboundCommand("katil abc123")).toEqual({ command: "JOIN", token: "abc123" });
  });

  it("parses a LOYALTY_CLAIM command", () => {
    expect(parseInboundCommand("SADAKAT xyz789")).toEqual({ command: "LOYALTY_CLAIM", token: "xyz789" });
  });

  it("returns null for unrecognized text", () => {
    expect(parseInboundCommand("merhaba")).toBeNull();
    expect(parseInboundCommand("KATIL")).toBeNull();
  });
});
