import { route } from "@/server/http";

/**
 * Liveness probe for uptime monitors and load balancers.
 *
 * Deliberately does NOT touch Postgres or Redis: it must stay cheap and must not flap
 * when a dependency is briefly down. Use it for "is the process up" checks; a deeper
 * readiness check (DB/Redis round-trip) can be added behind the reverse proxy later.
 */
export const GET = route({ auth: "none" }, async () => ({ ok: true, service: "web", time: new Date().toISOString() }));
