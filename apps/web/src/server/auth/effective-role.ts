import type { CurrentUser } from "./session";

/** Legacy admin-only workflows require unrestricted access, including for bearer tokens. */
export function effectiveRole(account: {role:string;scoped_management:boolean;is_system_owner:boolean}): CurrentUser["role"] {
  if (account.role === "admin" && (account.is_system_owner || !account.scoped_management)) return "admin";
  return account.role === "instructor" ? "instructor" : "member";
}
