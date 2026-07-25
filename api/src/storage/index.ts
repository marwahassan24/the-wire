import { env } from "../env.js";
import { LocalDiskStorage } from "./localDiskStorage.js";
import type { FileStorage } from "./types.js";

// Single switch point for the storage backend. Local disk today; swap in
// an S3/R2-backed FileStorage here later without any route changing.
export const storage: FileStorage = new LocalDiskStorage(env.UPLOAD_DIR);

export type { FileStorage } from "./types.js";
