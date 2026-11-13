import Link from "next/link";
import { Compass } from "lucide-react";
import { buttonClass } from "@/components/ui";

export default function NotFound() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 p-6 text-center">
      <span className="flex h-16 w-16 animate-float items-center justify-center rounded-full bg-muted text-muted-foreground">
        <Compass className="h-8 w-8" />
      </span>
      <p className="font-mono text-sm text-muted-foreground">404</p>
      <h1 className="text-2xl font-semibold tracking-tight">ไม่พบหน้าที่คุณต้องการ</h1>
      <p className="max-w-sm text-sm text-muted-foreground">ลิงก์อาจไม่ถูกต้อง หรือหน้านี้ถูกย้ายไปแล้ว</p>
      <div className="flex gap-2">
        <Link href="/" className={buttonClass("default")}>
          กลับหน้าแรก
        </Link>
        <Link href="/courses" className={buttonClass("outline")}>
          คลังหลักสูตร
        </Link>
      </div>
    </main>
  );
}
