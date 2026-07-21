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
};
