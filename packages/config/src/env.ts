import dotenv from "dotenv";
import { z } from "zod";

const developmentSecret = "dev-only-secret-change-me-1234567890";

export const runtimeEnvSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    HOST: z.string().min(1).default("127.0.0.1"),
    PORT: z.coerce.number().int().min(1).max(65_535).default(4_000),
    LOG_LEVEL: z.enum(["trace", "debug", "info", "warn", "error", "fatal", "silent"]).default("info"),
    APP_URL: z.string().url().default("http://127.0.0.1:4000"),
    CORS_ORIGINS: z.string().default("http://127.0.0.1:4000"),
    DATABASE_URL: z.string().url().default("postgresql://postgres:postgres@127.0.0.1:5432/restaurant_os"),
    REDIS_URL: z.string().url().default("redis://127.0.0.1:6379"),
    JWT_ISSUER: z.string().min(1).default("restaurant-os-api"),
    JWT_AUDIENCE: z.string().min(1).default("restaurant-os"),
    ACCESS_TOKEN_TTL_SECONDS: z.coerce.number().int().min(60).max(3_600).default(900),
    REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().min(1).max(365).default(30),
    REFRESH_COOKIE_NAME: z.string().min(1).default("restaurant_os_refresh"),
    SUPER_ADMIN_EMAIL: z.preprocess(
      (value) => (value === "" ? undefined : value),
      z.string().email().optional()
    ),
    SUPER_ADMIN_PASSWORD: z.preprocess(
      (value) => (value === "" ? undefined : value),
      z.string().min(12).optional()
    ),
    SESSION_SECRET: z.string().min(32).default(developmentSecret),
    JWT_SECRET: z.string().min(32).default(developmentSecret),
    REFRESH_TOKEN_SECRET: z.string().min(32).default(developmentSecret),
    PASSWORD_RESET_SECRET: z.string().min(32).default(developmentSecret),
    APP_ENCRYPTION_KEY: z.string().min(32).default(developmentSecret)
  })
  .superRefine((env, context) => {
    if (env.NODE_ENV !== "production") return;

    for (const [name, value] of Object.entries(env)) {
      if (name.endsWith("SECRET") || name === "APP_ENCRYPTION_KEY") {
        if (typeof value !== "string") continue;
        if (value.includes("change-me") || value.startsWith("dev-only")) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            path: [name],
            message: "Production secrets must be explicitly configured."
          });
        }
      }
    }
  });

export type RuntimeEnv = z.infer<typeof runtimeEnvSchema>;

export function parseEnv(input: Record<string, string | undefined> = process.env): RuntimeEnv {
  const result = runtimeEnvSchema.safeParse(input);
  if (!result.success) {
    const details = result.error.issues
      .map((issue) => `${issue.path.join(".") || "environment"}: ${issue.message}`)
      .join("; ");
    throw new Error(`Invalid environment: ${details}`);
  }
  return result.data;
}

export function loadEnv(): RuntimeEnv {
  dotenv.config();
  return parseEnv();
}
