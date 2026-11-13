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
    await client.query("BEGIN");
    try {
      await client.query(sql);
      await client.query("INSERT INTO schema_migrations (name, checksum) VALUES ($1, $2)", [file, checksum]);
      await client.query("COMMIT");
      console.log(`applied ${file}`);
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    }
  }
} finally {
  await client.query("SELECT pg_advisory_unlock(727274)").catch(() => {});
  await client.end();
}
