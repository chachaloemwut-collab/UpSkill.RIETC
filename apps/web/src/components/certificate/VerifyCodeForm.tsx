"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Search } from "lucide-react";
import { Button, Field, Input } from "@/components/ui";

export function VerifyCodeForm({ autoFocus = true }: { autoFocus?: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <form
      className="grid gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        const code = String(new FormData(e.currentTarget).get("code") ?? "").trim().toUpperCase();
        if (!code) return;
        setBusy(true);
        router.push(`/verify/${encodeURIComponent(code)}`);
      }}
    >
      <Field label="รหัสวุฒิบัตร">
        <Input name="code" required placeholder="CERT-2026-XXXX-XXXX-XXXX" className="h-11 font-mono uppercase tracking-wider" autoFocus={autoFocus} />
      </Field>
      <Button type="submit" size="lg" loading={busy}>
        <Search className="h-4 w-4" /> ตรวจสอบ
      </Button>
    </form>
  );
}
