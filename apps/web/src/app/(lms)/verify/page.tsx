import type { Metadata } from "next";
import { QrCode, ShieldCheck } from "lucide-react";
import { Card } from "@/components/ui";
import { VerifyCodeForm } from "@/components/certificate/VerifyCodeForm";

export const metadata: Metadata = { title: "ตรวจสอบใบรับรอง" };

export default function VerifyIndexPage() {
  return (
    <div className="mx-auto grid max-w-xl gap-6 pt-4 sm:pt-10">
      <div className="text-center">
        <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-primary text-primary-foreground">
          <ShieldCheck className="h-7 w-7" />
        </span>
        <h1 className="mt-4 text-2xl font-semibold tracking-tight">ตรวจสอบใบรับรอง</h1>
        <p className="mt-1 text-sm text-muted-foreground">กรอกรหัสบนใบรับรอง หรือสแกน QR Code บนใบรับรองเพื่อยืนยันความถูกต้อง</p>
      </div>
      <Card className="p-6">
        <VerifyCodeForm />
      </Card>
      <p className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
        <QrCode className="h-4 w-4" /> ใบรับรองทุกใบลงนามดิจิทัลด้วย Ed25519 · ข้อมูลที่ถูกแก้ไขจะตรวจพบทันที
      </p>
    </div>
  );
}
