import { z } from "zod";
import { HttpError } from "@/server/http";

/** Route params are user input: validate UUIDs before they reach a query */
export function uuidParam(v: string): string {
  if (!z.uuid().safeParse(v).success) throw new HttpError(404, "NOT_FOUND");
  return v;
}
