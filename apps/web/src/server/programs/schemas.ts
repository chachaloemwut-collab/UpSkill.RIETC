import "server-only";
import { z } from "zod";

/** ISO date-time with an explicit offset (the admin UI sends Bangkok time as +07:00) */
export const isoDate = z.iso.datetime({ offset: true }).transform((s) => new Date(s));

const ruleField = z.strictObject({
  key: z.string().max(40),
  label: z.string().max(120),
  type: z.enum(["text", "textarea"]),
  required: z.boolean(),
});

/** Shape only: values are normalized again by parseEligibilityRules (packages/core) */
export const EligibilityBody = z.strictObject({
  emailDomains: z.array(z.string().max(253)).max(20).default([]),
  groupIds: z.array(z.uuid()).max(20).default([]),
  requireLegalName: z.boolean().default(false),
  prerequisiteCourseIds: z.array(z.uuid()).max(20).default([]),
  applicationForm: z.array(ruleField).max(10).default([]),
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
  cohortId: z.uuid().nullable(),
  location: z.string().trim().max(255).nullable(),
  eventStartsAt: isoDate.nullable(),
  eventEndsAt: isoDate.nullable(),
  publishAt: isoDate,
  expiresAt: isoDate.nullable(),
  isPinned: z.boolean(),
  scheduledBroadcastAt: isoDate.nullable(),
});
