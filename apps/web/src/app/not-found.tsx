import Link from "next/link";

export default function NotFound() {
  return (
    <main className="mx-auto max-w-md px-4 py-16 text-center">
      <h1 className="text-xl font-bold">ไม่พบหน้าที่คุณต้องการ</h1>
      <Link href="/" className="mt-4 inline-block text-green-700 underline">
        กลับหน้าแรก
      </Link>
    </main>
  );
}
