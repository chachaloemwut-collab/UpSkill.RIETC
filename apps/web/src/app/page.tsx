import { AppHome } from "@/components/home/AppHome";
import { Dashboard } from "@/components/home/Dashboard";
import { LandingPage } from "@/components/landing/LandingPage";
import { LmsShell } from "@/components/shell/LmsShell";
import { ProfileBanner, needsProfile } from "@/components/account/ProfileBanner";
import { redirect } from "next/navigation";
import { getViewer } from "@/server/viewer";

export const dynamic = "force-dynamic";

// "/" lives outside the (lms) group: visitors get a full-width landing page, signed-in users get the
// dashboard inside the same shell as every other LMS page.
export default async function HomePage({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  const viewer = await getViewer();
  if (!viewer && (await searchParams).view === "website") return <LandingPage />;
  if (!viewer) return <><div className="public-app-home"><AppHome /></div><div className="public-web-home"><LandingPage /></div></>;
  if (viewer.isSystemOwner) redirect("/admin");
  return (
    <LmsShell user={{ name: viewer.name, email: viewer.username ?? viewer.email, role: viewer.role }}>
      <ProfileBanner show={needsProfile(viewer)} />
      <AppHome role={viewer.role} name={viewer.name} /><Dashboard viewer={viewer} />
    </LmsShell>
  );
}
