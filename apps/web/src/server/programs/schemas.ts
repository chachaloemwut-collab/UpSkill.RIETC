import "server-only";
import { z } from "zod";

/** ISO date-time with an explicit offset (the admin UI sends Bangkok time as +07:00) */
export const isoDate = z.iso.datetime({ offset: true }).transform((s) => new Date(s));

const ruleField = z.strictObject({
  key: z.string().trim().min(1).max(40),
  label: z.string().trim().min(1).max(120),
  type: z.enum(["text", "textarea", "select", "date", "number"]),
  required: z.boolean(),
  options: z.array(z.string().max(120)).max(20).optional(),
  showIf: z.strictObject({ field: z.string().max(40), value: z.string().max(120) }).optional(),
});

/** Shape only: values are normalized again by parseEligibilityRules (packages/core) */
export const EligibilityBody = z.strictObject({
  emailDomains: z.array(z.string().max(253)).max(20).default([]),
  groupIds: z.array(z.uuid()).max(20).default([]),
  groupMode: z.enum(["any", "all"]).default("any"),
  requireLegalName: z.boolean().default(false),
  prerequisiteCourseIds: z.array(z.uuid()).max(20).default([]),
  prerequisiteMode: z.enum(["any", "all"]).default("all"),
  applicationForm: z.array(ruleField).max(10).superRefine((fields, ctx) => {
    const seen = new Set<string>();
    for (const [index, field] of fields.entries()) {
      if (seen.has(field.key)) ctx.addIssue({ code: "custom", path: [index, "key"], message: "รหัสคำถามซ้ำ" });
      seen.add(field.key);
      if (field.type === "select" && !field.options?.some(value => value.trim())) {
        ctx.addIssue({ code: "custom", path: [index, "options"], message: "กรุณาระบุตัวเลือก" });
      }
      const condition = field.showIf;
      if (condition && !fields.some(parent => parent.key !== field.key && parent.key === condition.field && parent.type === "select" && parent.options?.includes(condition.value))) {
        ctx.addIssue({ code: "custom", path: [index, "showIf"], message: "กรุณาตรวจสอบคำถามและตัวเลือกที่ใช้อ้างอิง" });
      }
    }
  }).default([]),
});

export const CohortBody = z.strictObject({
  title: z.string().trim().min(1).max(255),
  registrationOpensAt: isoDate,
  registrationClosesAt: isoDate,
  startsAt: isoDate,
  endsAt: isoDate,
  capacity: z.number().int().min(1).max(100_000).nullable(),
  waitlistEnabled: z.boolean(),
  requiresApproval: z.boolean(),
  eligibility: EligibilityBody,
  clientUpdatedAt: isoDate.optional(),
  waitlistAcceptanceHours: z.number().int().min(1).max(720).nullable().optional(),
});

export const AnnouncementBody = z.strictObject({
  title: z.string().trim().min(3).max(255),
  summary: z.string().trim().max(500).nullable(),
  body: z.string().trim().min(1).max(20_000),
  kind: z.enum(["event", "news", "notice"]),
  programId: z.uuid().nullable(),
  cohortId: z.uuid().nullable().default(null),
  location: z.string().trim().max(255).nullable(),
  eventStartsAt: isoDate.nullable(),
  eventEndsAt: isoDate.nullable(),
  publishAt: isoDate,
  expiresAt: isoDate.nullable(),
  isPinned: z.boolean(),
  scheduledBroadcastAt: isoDate.nullable().default(null),
});
