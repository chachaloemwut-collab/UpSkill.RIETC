import { LmsShell } from "@/components/shell/LmsShell";
import { ProfileBanner, needsProfile } from "@/components/account/ProfileBanner";
import { getViewer } from "@/server/viewer";

export default async function LmsLayout({ children }: { children: React.ReactNode }) {
  const viewer = await getViewer();
  return (
    <LmsShell user={viewer ? { name: viewer.name, email: viewer.username ?? viewer.email, role: viewer.role } : null}>
      <ProfileBanner show={needsProfile(viewer)} />
      {children}
    </LmsShell>
  );
}
