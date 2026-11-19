import { z } from "zod";
import { route } from "@/server/http";
import { uuidParam } from "@/server/params";
import { setCourseSignerShown } from "@/server/certificates/signature.service";

const Body = z.strictObject({ show: z.boolean() });

/** Admin switch: print the signer (signature + name + title) on this course's certificates. */
export const PATCH = route<typeof Body, { id: string }>({ auth: "required", roles: ["admin"], body: Body }, async ({ params, body, user, ip }) =>
  setCourseSignerShown(user!, uuidParam(params.id), body.show, { ip }),
);
