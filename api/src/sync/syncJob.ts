import { pool, withTransaction } from "../db.js";
import { recordAudit } from "../audit.js";
import { normalizeText } from "../textNormalize.js";
import { CLIENT_LIST_COLUMNS } from "../routes/clients.js";
import { mapClientBundle, pick } from "./mapping.js";
import type { ClientBundle, MoneyInfoClient } from "./types.js";

// Server-side, read-only moneyinfo -> Postgres sync. Adapted from the
// standalone moneyinfo-sync.mjs script per the brief:
//
//   - Read-only against moneyinfo. This module never calls anything but
//     GET and the one documented read-style POST /Clients/Search (see
//     MoneyInfoClient) - it has no way to write back to moneyinfo at all.
//   - Fills basic client facts (name, dob, email, phone, status), the
//     portfolio summary line, and structured portfolio_holdings rows
//     (plans/investments/accounts, for asset-allocation charting) ONLY. It
//     never writes soft_facts, points, or meeting_notes - those are
//     adviser narrative, and there is simply no code path here that
//     touches those tables.
//   - portfolio_holdings is entirely sync-derived (no adviser edits it),
//     so each sync run replaces a matched client's rows wholesale rather
//     than appending - it's a snapshot of "what moneyinfo says now", not
//     a history.
//   - UPDATE-ONLY: a moneyinfo client is only synced into a Wire client
//     that already exists and already has moneyinfo_client_id set. This
//     job never INSERTs a new clients row, because adviser_id / cm_id /
//     review_cycle are firm judgement calls moneyinfo cannot supply - a
//     human has to create the client and link the ID first. Unmatched
//     stubs are reported back so that link-up can happen.
//   - Thread messages (the after-call actions) are stored raw in
//     moneyinfo_raw_sync, one row per sync, never touched by the mapping
//     step and never injected into the spine. That's the input for the
//     LATER Phase 2 extraction step, which is a separate, held-for-confirm
//     piece of work with its own human sense-check.
//   - Surname redaction to TESTCLIENT is hardcoded on in mapping.ts and is
//     not configurable from here.

const EMPTY_BUNDLE: ClientBundle = {
  core: {},
  std: {},
  contacts: {},
  dependants: {},
  employments: {},
  plans: {},
  investments: {},
  accounts: {},
  currency: {},
  threads: {},
};

const DEFAULT_LIMIT = 5;

export interface SyncOptions {
  // How many client stubs to process in this run. Matches the original
  // script's default of 5 - deliberately small so a first run against real
  // staging credentials touches only a handful of clients.
  limit?: number;
}

export interface SyncedClient {
  moneyinfoClientId: string;
  clientId: number;
  name: string;
  holdingsCount: number;
}

export interface UnmatchedClient {
  moneyinfoClientId: string;
  name: string;
  reason: string;
}

export interface SyncError {
  moneyinfoClientId: string;
  message: string;
}

export interface SyncResult {
  stubCount: number;
  processed: number;
  updated: SyncedClient[];
  unmatched: UnmatchedClient[];
  errors: SyncError[];
}

export async function runMoneyInfoSync(miClient: MoneyInfoClient, options: SyncOptions = {}): Promise<SyncResult> {
  const limit = options.limit ?? DEFAULT_LIMIT;

  let stubs = await miClient.searchClients();
  if (stubs.length === 0) {
    const groups = await miClient.listServiceGroups();
    for (const group of groups) {
      const ref = pick(group, "serviceGroupRef", "ref", "id");
      if (!ref) continue;
      stubs.push(...(await miClient.listServiceGroupClients(ref)));
    }
  }

  const { rows: existingClients } = await pool.query<{ id: number; moneyinfo_client_id: string }>(
    `SELECT id, moneyinfo_client_id FROM clients WHERE moneyinfo_client_id IS NOT NULL AND deleted_at IS NULL`
  );
  const matchedClientId = new Map(existingClients.map((c) => [c.moneyinfo_client_id, c.id]));

  const result: SyncResult = { stubCount: stubs.length, processed: 0, updated: [], unmatched: [], errors: [] };

  for (const stub of stubs) {
    if (result.processed >= limit) break;
    const moneyinfoClientId = pick(stub, "clientId", "id", "ref");
    if (!moneyinfoClientId) continue;
    result.processed++;

    const existingId = matchedClientId.get(moneyinfoClientId);
    if (existingId === undefined) {
      const preview = mapClientBundle(moneyinfoClientId, stub, EMPTY_BUNDLE);
      result.unmatched.push({
        moneyinfoClientId,
        name: `${preview.firstNames} ${preview.surname}`,
        reason: "No client in Wire has this moneyinfo_client_id - create the client and set moneyinfo_client_id, then re-run.",
      });
      continue;
    }

    try {
      const bundle = await miClient.fetchClientBundle(moneyinfoClientId);
      const mapped = mapClientBundle(moneyinfoClientId, stub, bundle);

      const updated = await withTransaction(async (tx) => {
        const { rows: beforeRows } = await tx.query(`SELECT ${CLIENT_LIST_COLUMNS} FROM clients WHERE id = $1`, [
          existingId,
        ]);
        const before = beforeRows[0];

        const { rows: updatedRows } = await tx.query(
          `UPDATE clients
              SET first_names = $1, surname = $2, dob = $3, email = $4, phone = $5,
                  status = $6, version = version + 1, updated_at = now()
            WHERE id = $7
          RETURNING ${CLIENT_LIST_COLUMNS}`,
          [mapped.firstNames, mapped.surname, mapped.dob, mapped.email, mapped.phone, mapped.status, existingId]
        );
        const after = updatedRows[0];
        // userId: null marks this as a machine-authored write, not an adviser edit.
        await recordAudit(tx, {
          userId: null,
          entityType: "client",
          entityId: after.id,
          action: "update",
          before,
          after,
        });

        const { rows: beforePortfolioRows } = await tx.query(
          `SELECT * FROM portfolio_summary WHERE client_id = $1`,
          [existingId]
        );
        const beforePortfolio = beforePortfolioRows[0] ?? null;
        const { rows: portfolioRows } = await tx.query(
          `INSERT INTO portfolio_summary (client_id, summary, updated_by, updated_at)
           VALUES ($1, $2, NULL, now())
           ON CONFLICT (client_id)
           DO UPDATE SET summary = EXCLUDED.summary, updated_by = NULL, updated_at = now()
           RETURNING client_id, summary, updated_by, updated_at`,
          [existingId, normalizeText(mapped.portfolioSummary)]
        );
        await recordAudit(tx, {
          userId: null,
          entityType: "portfolio_summary",
          entityId: existingId,
          action: beforePortfolio ? "update" : "create",
          before: beforePortfolio,
          after: portfolioRows[0],
        });

        const { rows: beforeHoldingsCountRows } = await tx.query<{ count: number }>(
          `SELECT count(*)::int AS count FROM portfolio_holdings WHERE client_id = $1`,
          [existingId]
        );
        await tx.query(`DELETE FROM portfolio_holdings WHERE client_id = $1`, [existingId]);
        for (const h of mapped.holdings) {
          await tx.query(
            `INSERT INTO portfolio_holdings
               (client_id, moneyinfo_holding_id, source, provider, plan_type, holding_name, asset_class, value, currency, as_of_date, raw)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
            [
              existingId,
              h.moneyinfoHoldingId,
              h.source,
              h.provider,
              h.planType,
              h.holdingName,
              h.assetClass,
              h.value,
              h.currency,
              h.asOfDate,
              JSON.stringify(h.raw),
            ]
          );
        }
        // One summarising audit entry rather than one per holding row -
        // the rows themselves (and moneyinfo_raw_sync below) are the
        // detailed record; audit_log just needs to show the replace happened.
        await recordAudit(tx, {
          userId: null,
          entityType: "portfolio_holdings",
          entityId: existingId,
          action: "update",
          before: { count: beforeHoldingsCountRows[0].count },
          after: {
            count: mapped.holdings.length,
            totalValue: mapped.holdings.reduce((sum, h) => sum + (h.value ?? 0), 0),
          },
        });

        // Raw sidecar, incl. thread messages, for the later extraction
        // step. Never read by soft_facts/points/meeting_notes.
        const { rows: rawRows } = await tx.query(
          `INSERT INTO moneyinfo_raw_sync (client_id, moneyinfo_client_id, raw)
           VALUES ($1, $2, $3) RETURNING id`,
          [existingId, moneyinfoClientId, JSON.stringify({ stub, ...bundle })]
        );
        await recordAudit(tx, {
          userId: null,
          entityType: "moneyinfo_raw_sync",
          entityId: rawRows[0].id,
          action: "create",
          before: null,
          after: { client_id: existingId, moneyinfo_client_id: moneyinfoClientId },
        });

        return after;
      });

      result.updated.push({
        moneyinfoClientId,
        clientId: updated.id,
        name: `${mapped.firstNames} ${mapped.surname}`,
        holdingsCount: mapped.holdings.length,
      });
    } catch (err) {
      result.errors.push({ moneyinfoClientId, message: err instanceof Error ? err.message : String(err) });
    }
  }

  return result;
}
