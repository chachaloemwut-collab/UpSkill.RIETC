"use client";

import { useEffect, useState } from "react";
import { Bell, BellOff } from "lucide-react";
import { Button } from "@/components/ui";

/** "Notify me when registration opens" — only rendered for a scheduled (not yet open) cohort. */
export function WatchCohortButton({ cohortId }: { cohortId: string }) {
  const [watching, setWatching] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch(`/api/cohorts/${cohortId}/watch`)
      .then((r) => r.json())
      .then((j: { watching?: boolean }) => setWatching(Boolean(j.watching)))
      .catch(() => {});
  }, [cohortId]);

  async function toggle() {
    setBusy(true);
    try {
      const r = await fetch(`/api/cohorts/${cohortId}/watch`, { method: watching ? "DELETE" : "POST" });
      if (r.ok) setWatching(!watching);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button variant={watching ? "outline" : "default"} size="sm" loading={busy} onClick={toggle}>
      {watching ? <BellOff className="h-4 w-4" /> : <Bell className="h-4 w-4" />}
      {watching ? "ยกเลิกการแจ้งเตือน" : "แจ้งเตือนเมื่อเปิดรับสมัคร"}
    </Button>
  );
}
