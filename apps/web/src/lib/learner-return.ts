/** Only learner destinations without a query or fragment may survive authentication. */
export function learnerReturn(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 300) return null;
  if (["/me", "/me/profile", "/my-courses", "/certificates"].includes(value)) return value;
  return /^\/courses\/[a-z0-9_-]+(?:\/(?:apply|quiz|certificate|pre-test|lessons\/[0-9a-f-]{36}(?:\/test)?))?$/i.test(value) ? value : null;
}
