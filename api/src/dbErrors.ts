interface PgError {
  code?: string;
}

function isPgError(err: unknown): err is PgError {
  return typeof err === "object" && err !== null && "code" in err;
}

// Translates the handful of Postgres constraint violations these routes can
// legitimately hit (bad foreign key, duplicate unique value, a status
// transition that fails a CHECK) into a clean 400 message instead of a raw
// 500. Anything else is returned as null so the caller rethrows it.
export function friendlyConstraintMessage(err: unknown): string | null {
  if (!isPgError(err)) return null;
  switch (err.code) {
    case "23503":
      return "Referenced record does not exist.";
    case "23505":
      return "A record with that value already exists.";
    case "23514":
      return "That change isn't allowed - check the required fields for this status.";
    default:
      return null;
  }
}
