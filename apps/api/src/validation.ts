import type { ZodType, output } from "zod";
import { ApiError } from "./errors.js";

export function parseInput<Schema extends ZodType>(schema: Schema, input: unknown): output<Schema> {
  const result = schema.safeParse(input);
  if (!result.success) {
    throw new ApiError(400, "VALIDATION_ERROR", "Request validation failed.", result.error.flatten());
  }
  return result.data;
}
