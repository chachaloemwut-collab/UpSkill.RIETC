"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { LogIn } from "lucide-react";
import { api } from "@/lib/api";
import { Button, buttonClass, confettiFrom, useToast } from "@/components/ui";

export function EnrollButton({ courseId, loggedIn }: { courseId: string; loggedIn: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  if (!loggedIn)
    return (
      <Link href="/login" className={buttonClass("default", "lg", "w-full")}>
        <LogIn className="h-4 w-4" /> เข้าสู่ระบบเพื่อลงทะเบียนเรียน
      </Link>
    );
  return (
    <Button
      size="lg"
      className="w-full"
      loading={busy}
      onClick={async (e) => {
        const el = e.currentTarget;
        setBusy(true);
        const r = await api(`/api/courses/${courseId}/enroll`, { method: "POST" });
        setBusy(false);
        if (r.ok) {
          confettiFrom(el, { count: 60 });
          toast({ title: "ลงทะเบียนเรียนแล้ว", description: "เริ่มเรียนบทแรกได้เลย", variant: "success" });
          router.refresh();
        } else toast({ title: "ลงทะเบียนไม่สำเร็จ", description: r.message, variant: "destructive" });
      }}
    >
      ลงทะเบียนเรียน (ฟรี)
    </Button>
  );
}
