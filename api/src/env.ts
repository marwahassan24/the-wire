import { config } from "dotenv";
import { fileURLToPath } from "node:url";

// The API reads the single .env at the repo root, regardless of cwd.
config({ path: fileURLToPath(new URL("../../.env", import.meta.url)) });

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

export const env = {
  NODE_ENV: process.env.NODE_ENV ?? "development",
  PORT: Number(process.env.PORT ?? 3001),
  DATABASE_URL: required("DATABASE_URL"),
  WEB_ORIGIN: process.env.WEB_ORIGIN ?? "http://localhost:5173",
  // Attachment storage - local disk only, test files only, per the brief
  // (no live client documents until the data protection ruling). Resolved
  // relative to wherever the process is run from, same as wire-sync-output.
  UPLOAD_DIR: process.env.UPLOAD_DIR ?? "./uploads",
  MAX_UPLOAD_BYTES: Number(process.env.MAX_UPLOAD_BYTES ?? 20 * 1024 * 1024),
};
