import { describe, expect, it } from "vitest";
import { buildTelegramCallbackData, parseTelegramCallbackData, parseTelegramLinkCommand } from "./telegram.js";

describe("parseTelegramLinkCommand", () => {
  it("parses a /link command with a 6-digit code", () => {
    expect(parseTelegramLinkCommand("/link 482913")).toBe("482913");
    expect(parseTelegramLinkCommand("/link@RestaurantOsBot 482913")).toBe("482913");
  });

  it("returns null for malformed input", () => {
    expect(parseTelegramLinkCommand("/link")).toBeNull();
    expect(parseTelegramLinkCommand("/link abcdef")).toBeNull();
    expect(parseTelegramLinkCommand("merhaba")).toBeNull();
  });
});

describe("telegram callback data", () => {
  it("round-trips order id and status through build/parse", () => {
    const data = buildTelegramCallbackData("11111111-1111-1111-1111-111111111111", "ACCEPTED");
    expect(parseTelegramCallbackData(data)).toEqual({
      orderId: "11111111-1111-1111-1111-111111111111",
      toStatus: "ACCEPTED"
    });
  });

  it("rejects unknown prefixes or statuses", () => {
    expect(parseTelegramCallbackData("other:123:ACCEPTED")).toBeNull();
    expect(parseTelegramCallbackData("ord:123:NOT_A_STATUS")).toBeNull();
    expect(parseTelegramCallbackData("ord:123")).toBeNull();
  });
});
