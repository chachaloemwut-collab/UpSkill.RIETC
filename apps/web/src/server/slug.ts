import "server-only";
import { randomBytes } from "node:crypto";

/** URL slug from a title. Thai titles produce an empty ASCII base, so a random suffix always keeps it unique. */
export function slugify(title: string, fallback = "item"): string {
  const base = title
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/g, "");
  return `${base || fallback}-${randomBytes(3).toString("hex")}`;
}
