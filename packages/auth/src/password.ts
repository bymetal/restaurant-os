import { hash, verify } from "@node-rs/argon2";

const argonOptions = {
  algorithm: 2,
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1
} as const;

export async function hashPassword(password: string): Promise<string> {
  if (password.length < 12) throw new Error("Password must contain at least 12 characters.");
  return hash(password, argonOptions);
}

export async function verifyPassword(passwordHash: string, password: string): Promise<boolean> {
  return verify(passwordHash, password, argonOptions);
}

export const dummyPasswordHash =
  "$argon2id$v=19$m=19456,t=2,p=1$cmVzdG9yYW50LW9zLWR1bW15LXNhbHQ$1uG6u3oU9XbqRzYQ6n8wHh3g2V6n7v4Vx2jYf7pP3lQ";
