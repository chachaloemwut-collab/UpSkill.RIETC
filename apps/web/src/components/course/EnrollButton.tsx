"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/lib/api";
import { Alert, Button } from "@/components/ui";

export function EnrollButton({ courseId, loggedIn }: { courseId: string; loggedIn: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!loggedIn)
    return (
      <a href="/login" className="inline-flex rounded-lg bg-green-700 px-4 py-2.5 text-sm font-medium text-white hover:bg-green-800">
        เข้าสู่ระบบเพื่อลงทะเบียนเรียน
      </a>
    );
  return (
    <div className="space-y-2">
      {error && <Alert tone="error">{error}</Alert>}
      <Button
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          const r = await api(`/api/courses/${courseId}/enroll`, { method: "POST" });
          setBusy(false);
          if (r.ok) router.refresh();
          else setError(r.message);
        }}
      >
        ลงทะเบียนเรียน (ฟรี)
      </Button>
    </div>
  );
}
