import { Kysely, PostgresDialect } from "kysely";
import pg from "pg";
// src/generated.ts is produced by `pnpm db:codegen` from the real database (SQL is the source of truth).
import type { DB } from "./generated.js";

export type { DB };
export type Database = Kysely<DB>;

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
