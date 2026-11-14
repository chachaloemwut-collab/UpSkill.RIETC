import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { ctx } from "@/server/context";

const Event = z.strictObject({
  event_id: z.string().min(1).max(255),
  message_id: z.string().max(255).optional(),
  recipient: z.email().max(254).optional(),
  event_type: z.enum(["queued", "sent", "delivered", "deferred", "soft_bounce", "hard_bounce", "complaint", "rejected", "opened", "clicked"]),
  occurred_at: z.iso.datetime(),
  metadata: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])).default({}),
});

function secretMatches(header: string | null, expected: string) {
  const value = header?.startsWith("Bearer ") ? header.slice(7) : "";
  const a = Buffer.from(value);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(req: NextRequest) {
  const { db, env } = ctx();
  if (!env.EMAIL_WEBHOOK_SECRET) return NextResponse.json({ error: "WEBHOOK_NOT_CONFIGURED" }, { status: 503 });
  if (!secretMatches(req.headers.get("authorization"), env.EMAIL_WEBHOOK_SECRET)) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  const text = await req.text();
  if (Buffer.byteLength(text) > 64 * 1024) return NextResponse.json({ error: "PAYLOAD_TOO_LARGE" }, { status: 413 });
  let input: unknown;
  try { input = JSON.parse(text); } catch { return NextResponse.json({ error: "INVALID_JSON" }, { status: 400 }); }
  const parsed = Event.safeParse(input);
  if (!parsed.success) return NextResponse.json({ error: "VALIDATION_FAILED" }, { status: 400 });
  const event = parsed.data;
  const outbox = event.message_id
    ? await db.selectFrom("email_outbox").select("id").where("provider_message_id", "=", event.message_id).executeTakeFirst()
    : null;
  await db.transaction().execute(async (trx) => {
    await trx
      .insertInto("email_delivery_events")
      .values({
        outbox_id: outbox?.id ?? null,
        provider_event_id: event.event_id,
        provider_message_id: event.message_id ?? null,
        recipient_email: event.recipient?.toLowerCase() ?? null,
        event_type: event.event_type,
        occurred_at: new Date(event.occurred_at),
        payload: event.metadata,
      })
      .onConflict((oc) => oc.column("provider_event_id").doNothing())
      .execute();
    if (event.recipient && (event.event_type === "hard_bounce" || event.event_type === "complaint")) {
      await trx
        .insertInto("email_suppressions")
        .values({ email: event.recipient.toLowerCase(), reason: event.event_type, provider_event_id: event.event_id })
        .onConflict((oc) => oc.column("email").doUpdateSet({ reason: event.event_type, provider_event_id: event.event_id, created_at: new Date() }))
        .execute();
    }
  });
  return NextResponse.json({ ok: true });
}
