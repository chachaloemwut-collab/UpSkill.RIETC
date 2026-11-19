import { z } from "zod";
import { route } from "@/server/http";
import { getAutomationFlags, getAutomationBacklog, toggleAutomation, type AutomationName } from "@/server/automation.service";

export const GET = route({ auth: "required", roles: ["admin"] }, async () => {
  const [flags, backlog] = await Promise.all([getAutomationFlags(), getAutomationBacklog()]);
  return { flags, backlog };
});

const Body = z.strictObject({
  name: z.enum(["assignment_reminders", "cohort_notifications", "waitlist_promotion"]),
  paused: z.boolean(),
});
export const PATCH = route<typeof Body>({ auth: "required", roles: ["admin"], body: Body }, async ({ user, body }) =>
  toggleAutomation(user!, body.name as AutomationName, body.paused),
);
