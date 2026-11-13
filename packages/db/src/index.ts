import { Kysely, PostgresDialect, type Transaction } from "kysely";
import pg from "pg";
// src/generated.ts is produced by `pnpm db:codegen` from the real database (SQL is the source of truth).
import type { DB } from "./generated.ts";

export { sql } from "kysely";
export type { DB };
export type Database = Kysely<DB>;
export type Tx = Transaction<DB>;

// Note: int8 (COUNT/SUM) and numeric come back as strings, matching the generated types.
// Cast in SQL (`count(*)::int`) when a number is needed.

export function createDb(connectionString: string): Database {
  const pool = new pg.Pool({
    connectionString,
    max: 20,
    // Defend against slow queries holding connections forever / lock pile-ups
    statement_timeout: 5_000,
    idle_in_transaction_session_timeout: 10_000,
    application_name: "upskill",
  });
  return new Kysely<DB>({ dialect: new PostgresDialect({ pool }) });
}

/** Postgres error codes we handle explicitly */
export const PG = { UNIQUE_VIOLATION: "23505", CHECK_VIOLATION: "23514", INSUFFICIENT_PRIVILEGE: "42501" } as const;
export function pgErrorCode(err: unknown): string | undefined {
  return typeof err === "object" && err !== null && "code" in err ? String((err as { code: unknown }).code) : undefined;
}
