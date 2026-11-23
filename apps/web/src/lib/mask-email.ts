/** Only for delivery confirmations. Never use this value to address a message. */
export function maskEmail(value: string): string {
  const [local, domain] = value.trim().toLowerCase().split("@");
  if (!local || !domain) return "อีเมลหลักของบัญชี";
  const hide = (part: string) => part.length > 1 ? part.charAt(0) + "XXX" : "XXX";
  const labels = domain.split(".");
  return hide(local) + "@" + labels.map((part, i) => i > 0 && i === labels.length - 1 ? part : hide(part)).join(".");
}
