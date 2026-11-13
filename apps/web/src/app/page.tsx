import { Dashboard } from "@/components/home/Dashboard";
import { LandingPage } from "@/components/landing/LandingPage";
import { LmsShell } from "@/components/shell/LmsShell";
import { getViewer } from "@/server/viewer";

export const dynamic = "force-dynamic";

// "/" lives outside the (lms) group: visitors get a full-width landing page, signed-in users get the
// dashboard inside the same shell as every other LMS page.
export default async function HomePage() {
  const viewer = await getViewer();
  if (!viewer) return <LandingPage />;
  return (
    <LmsShell user={{ name: viewer.name, email: viewer.username ?? viewer.email, role: viewer.role }}>
      <Dashboard viewer={viewer} />
    </LmsShell>
  );
}
