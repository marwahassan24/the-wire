import argon2 from "argon2";

export function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, { type: argon2.argon2id });
}

export function verifyPassword(hash: string, password: string): Promise<boolean> {
  return argon2.verify(hash, password);
}

// A real, valid argon2 hash of a fixed, unused value — computed once at
// startup so "user not found" and "wrong password" take about the same
// time. Without this, login response time would leak which emails exist.
const dummyHash = await argon2.hash("not-a-real-password", { type: argon2.argon2id });

export function verifyAgainstDummyHash(password: string): Promise<boolean> {
  return argon2.verify(dummyHash, password);
}
