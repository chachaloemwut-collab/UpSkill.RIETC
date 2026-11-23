import { z } from "zod";

export const LoginIdentifier = z.string().trim().toLowerCase().pipe(z.union([
  z.email().max(254),
  z.string().regex(/^[a-z][a-z0-9._-]{2,31}$/),
]));
