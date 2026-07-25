// The storage boundary for attachment file bytes. Routes and the DB layer
// (attachments.storage_key) only ever talk to this interface, never to the
// filesystem directly - so swapping LocalDiskStorage for an S3/R2-backed
// implementation later is a one-file change, not a routes rewrite.
//
// Keys are opaque strings chosen by the caller (attachments.ts generates a
// UUID), not filenames - the original filename is a separate DB column
// (attachments.filename) used only for display and download headers.
export interface FileStorage {
  save(key: string, data: Buffer): Promise<void>;
  read(key: string): Promise<Buffer>;
  // Not called by today's routes - soft-delete is DB-only, matching every
  // other table in the app ("nothing vanishes"; see attachments.ts). Kept
  // on the interface because a real storage backend needs a delete
  // operation eventually (a hard-purge tool, or the data protection
  // ruling requiring real erasure) and every object-storage SDK exposes
  // one, so the abstraction would be incomplete without it.
  remove(key: string): Promise<void>;
}
