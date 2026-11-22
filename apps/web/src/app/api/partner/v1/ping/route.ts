import { partnerRoute } from "@/server/partner/partner-http";

// Lets a partner check its key and IP allowlist without sending any personal data
export const GET = partnerRoute({ endpoint: "ping", scope: "training:lookup" }, async ({ client }) => ({
  body: { ok: true, client: client.name, scopes: client.scopes, key_expires_at: client.expiresAt.toISOString() },
}));
