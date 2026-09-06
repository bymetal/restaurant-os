export class InvalidPhoneError extends Error {
  constructor() {
    super("Phone number is invalid.");
    this.name = "InvalidPhoneError";
  }
}

export function normalizePhone(input: string): string {
  const digits = input.replace(/\D/g, "");
  if (digits.length < 7 || digits.length > 20) throw new InvalidPhoneError();
  return digits.startsWith("00") ? digits.slice(2) : digits;
}
