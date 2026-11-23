// Record known screens only. Never store query strings, search terms or invitation tokens.
const sections = new Set("admin assignments certificates courses instructor me programs support announcements documents enrollments invitations my-courses privacy verify login register forgot-password reset-password verify-email".split(" "));
const labels = new Set("admin assignments certificates courses instructor me programs support announcements documents enrollments invitations my-courses privacy verify login register forgot-password reset-password verify-email application profile users reports cohorts lessons apply certificate quiz pre-test test registration result new".split(" "));
export function activityScreen(value:string) {
  const parts=value.split(/[?#]/,1)[0]!.split("/").filter(Boolean);
  if(!parts.length)return "/";
  if(!sections.has(parts[0]!))return "/other";
  return "/"+parts.slice(0,9).map((part,i)=>{
    if(parts[i-1]==="invitations")return "[invitation]";
    if(labels.has(part))return part;
    if(/^[\da-f]{8}-(?:[\da-f]{4}-){3}[\da-f]{12}$/i.test(part)||/^CERT-[\dA-Z-]{12,24}$/.test(part))return part;
    if(["courses","programs","announcements"].includes(parts[i-1]??"") && /^[a-z0-9-]{1,128}$/.test(part))return part;
    return "[record]";
  }).join("/");
}
