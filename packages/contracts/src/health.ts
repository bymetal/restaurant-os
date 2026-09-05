import { z } from "zod";

const timestamp = z.string().datetime();

export const liveHealthSchema = z.object({
  status: z.literal("ok"),
  service: z.string(),
  timestamp
});

export const readyHealthSchema = z.object({
  status: z.enum(["ok", "not_ready"]),
  service: z.string(),
  timestamp,
  dependencies: z.object({
    database: z.enum(["ok", "down"]),
    redis: z.enum(["ok", "down"])
  }),
  requestId: z.string()
});

export type LiveHealth = z.infer<typeof liveHealthSchema>;
export type ReadyHealth = z.infer<typeof readyHealthSchema>;
