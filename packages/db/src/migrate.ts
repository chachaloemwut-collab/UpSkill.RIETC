// Minimal forward-only SQL migration runner.
// - Uses DATABASE_MIGRATION_URL (owner role), never the app role
// - Each file runs in its own transaction plus an advisory lock (prevents two deploys migrating at once)
// - Stores a checksum so an applied file that gets edited is detected
import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import pg from "pg";

const url = process.env.DATABASE_MIGRATION_URL;
if (!url) throw new Error("DATABASE_MIGRATION_URL is required");

/**
 * Single-role hosting (one DB user that owns the schema and is also used by the app, no permission to create
 * roles): the GRANT/REVOKE statements for the least-privilege roles cannot run there. With this flag they are
 * skipped; everything else (tables, triggers, constraints) runs unchanged and the checksum still covers the
 * original file, so the same migrations stay valid for both setups.
 */
const skipRoleGrants = process.env.MIGRATION_SKIP_ROLE_GRANTS === "1";
// The optional ALTER DEFAULT PRIVILEGES prefix must be swallowed with its GRANT, or the dangling prefix is a syntax error
const ROLE_GRANT = /^[ \t]*(?:ALTER\s+DEFAULT\s+PRIVILEGES\b[^;]*?)?\b(?:GRANT|REVOKE)\b[^;]*?\b(?:upskill_app|upskill_readonly)\b[^;]*;/gim;
function forThisDatabase(sql: string): { sql: string; skipped: number } {
  if (!skipRoleGrants) return { sql, skipped: 0 };
  let skipped = 0;
  const out = sql.replace(ROLE_GRANT, (m) => {
    skipped++;
    return `-- [skipped: single-role hosting] ${m.replace(/\s+/g, " ").slice(0, 80)}…`;
  });
  return { sql: out, skipped };
}

const dir = fileURLToPath(new URL("../migrations/", import.meta.url));
const client = new pg.Client({ connectionString: url });
await client.connect();

try {
  await client.query("SELECT pg_advisory_lock(727274)");
  await client.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
    name TEXT PRIMARY KEY, checksum TEXT NOT NULL, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())`);

  const applied = new Map(
    (await client.query<{ name: string; checksum: string }>("SELECT name, checksum FROM schema_migrations")).rows
      .map((r) => [r.name, r.checksum]),
  );

  const files = (await readdir(dir)).filter((f) => /^\d{4}_.+\.sql$/.test(f)).sort();
  for (const file of files) {
    const sql = await readFile(dir + file, "utf8");
    const checksum = createHash("sha256").update(sql).digest("hex");
    const prev = applied.get(file);
    if (prev) {
      if (prev !== checksum) throw new Error(`Migration ${file} was modified after being applied`);
      continue;
    }
    const run = forThisDatabase(sql);
    await client.query("BEGIN");
    try {
      await client.query(run.sql);
      await client.query("INSERT INTO schema_migrations (name, checksum) VALUES ($1, $2)", [file, checksum]);
      await client.query("COMMIT");
      console.log(`applied ${file}${run.skipped ? ` (skipped ${run.skipped} role grant statements)` : ""}`);
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    }
  }
} finally {
  await client.query("SELECT pg_advisory_unlock(727274)").catch(() => {});
  await client.end();
}
