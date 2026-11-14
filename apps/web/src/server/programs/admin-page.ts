import "server-only";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import { getCurrentUser } from "../auth/session";
import { HttpError } from "../http";

/** Admin page guard: visitors go to login, non-admins to home */
export async function requireAdminPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "admin") redirect("/");
  return user;
}

export function uuidOr404(id: string): string {
  if (!z.uuid().safeParse(id).success) notFound();
  return id;
}

/** Run a loader, turning a service 404 into the Next not-found page */
export async function or404<T>(p: Promise<T>): Promise<T> {
  try {
    return await p;
  } catch (err) {
    if (err instanceof HttpError && err.status === 404) notFound();
    throw err;
  }
}
